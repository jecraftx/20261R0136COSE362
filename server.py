import torch
import torch.nn as nn
import pandas as pd
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS


# === model classes, identical to the notebook ===

class VAEEncoder(nn.Module):
    def __init__(self, scenario_dim, profile_dim, hidden_dim=64, latent_dim=8):
        super().__init__()
        input_dim = scenario_dim + profile_dim
        self.shared = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU()
        )
        self.mu_layer = nn.Linear(hidden_dim, latent_dim)
        self.logvar_layer = nn.Linear(hidden_dim, latent_dim)

    def encode(self, s, c):
        h = torch.cat([s, c], dim=1)
        h = self.shared(h)
        mu = self.mu_layer(h)
        logvar = self.logvar_layer(h)
        return mu, logvar

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + std * eps

    def kl_divergence(self, mu, logvar):
        kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)
        return kl.mean()

    def forward(self, s, c):
        mu, logvar = self.encode(s, c)
        z = self.reparameterize(mu, logvar)
        kl_loss = self.kl_divergence(mu, logvar)
        return z, mu, logvar, kl_loss


class VAEDecoder(nn.Module):
    def __init__(self, latent_dim=8, profile_dim=16, hidden_dim=64, scenario_dim=22):
        super().__init__()
        input_dim = latent_dim + profile_dim + 1
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, scenario_dim)
        )

    def forward(self, z, c, d):
        if isinstance(d, (int, float)):
            d_tensor = torch.full((z.size(0), 1), float(d))
        else:
            d_tensor = d.view(-1, 1).float()
        x = torch.cat([z, c, d_tensor], dim=1)
        return self.network(x)


# === generation logic, identical to the notebook ===

def normalize(values, minimum, maximum):
    feature_range = maximum - minimum
    feature_range = torch.where(
        feature_range == 0,
        torch.ones_like(feature_range),
        feature_range
    )
    return (values - minimum) / feature_range


def denormalize(values, minimum, maximum):
    return values * (maximum - minimum) + minimum


def nearest_valid_code(value, valid_codes):
    return min(valid_codes, key=lambda code: abs(code - value))


def generate_scenario(decoder, founder_profile, difficulty, checkpoint, scenario_df, z=None):
    profile_tensor = torch.tensor(
        [[
            founder_profile["stage"],
            founder_profile["sector"],
            founder_profile["funding"],
            founder_profile["team_size"]
        ]],
        dtype=torch.float32
    )

    profile_normalized = normalize(
        profile_tensor,
        checkpoint["profile_min"],
        checkpoint["profile_max"]
    )

    difficulty_tensor = torch.tensor([[difficulty]], dtype=torch.float32)
    difficulty_normalized = normalize(
        difficulty_tensor,
        checkpoint["difficulty_min"],
        checkpoint["difficulty_max"]
    )

    if z is None:
        z = torch.randn(1, checkpoint["latent_dim"])

    with torch.no_grad():
        scenario_normalized = decoder(z, profile_normalized, difficulty_normalized)

    scenario_normalized = torch.clamp(scenario_normalized, min=0.0, max=1.0)
    scenario_raw = denormalize(
        scenario_normalized,
        checkpoint["scenario_min"],
        checkpoint["scenario_max"]
    )

    generated_fraud_value = scenario_raw[0, 0].item()
    generated_risk_value = scenario_raw[0, 1].item()
    predicted_rating = scenario_raw[0, 2].item()

    valid_fraud_codes = scenario_df["fraud_type_encoded"].dropna().unique().tolist()
    valid_risk_codes = scenario_df["risk_level_encoded"].dropna().unique().tolist()

    fraud_code = nearest_valid_code(generated_fraud_value, valid_fraud_codes)
    risk_code = nearest_valid_code(generated_risk_value, valid_risk_codes)

    rating_min = scenario_df["user_rating"].min()
    rating_max = scenario_df["user_rating"].max()
    predicted_rating = max(rating_min, min(rating_max, predicted_rating))

    matches = scenario_df[
        (scenario_df["fraud_type_encoded"] == fraud_code) & (scenario_df["risk_level_encoded"] == risk_code)
    ].copy()

    if matches.empty:
        matches = scenario_df[scenario_df["fraud_type_encoded"] == fraud_code].copy()

    if matches.empty:
        matches = scenario_df.copy()

    matches["rating_distance"] = (matches["user_rating"] - predicted_rating).abs()
    top_matches = matches.sort_values("rating_distance").head(5)
    selected = top_matches.sample(1).iloc[0]

    return {
        "difficulty": float(difficulty),
        "fraud_type_encoded": int(fraud_code),
        "fraud_type": selected["fraud_type"],
        "risk_level_encoded": int(risk_code),
        "risk_level": selected["risk_level"],
        "predicted_user_rating": float(predicted_rating),
        "short_summary": selected["short_summary"],
        "red_flags": selected["red_flags"],
        "correct_action": selected["correct_action"]
    }


# === load model + data once at startup ===

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "trained_vae.pt"
SCENARIO_PATH = BASE_DIR / "fraud_scenarios_encoded.csv"

checkpoint = torch.load(MODEL_PATH, map_location="cpu")
Scenario_DF = pd.read_csv(SCENARIO_PATH)

decoder = VAEDecoder(
    latent_dim=checkpoint["latent_dim"],
    profile_dim=checkpoint["profile_dim"],
    hidden_dim=checkpoint["hidden_dim"],
    scenario_dim=checkpoint["scenario_dim"]
)
decoder.load_state_dict(checkpoint["decoder_state_dict"])
decoder.eval()


# === stage/sector label maps, for converting UI dropdown text to the encoded ints the model expects ===

STAGE_MAP = {"pre-idea": 0, "idea": 0, "early": 0, "pre-seed": 0, "seed": 1, "series-a": 2, "series_a": 2}
SECTOR_MAP = {"fintech": 0, "healthcare": 1, "saas": 2, "ecommerce": 3, "education": 4, "biotech": 5, "logistics": 6, "edtech": 7, "deeptech": 2, "other": 2}


# === API ===

app = Flask(__name__)
CORS(app)


@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json()

    stage_raw = str(data.get("stage", "seed")).lower()
    sector_raw = str(data.get("sector", "saas")).lower()

    founder_profile = {
        "stage": STAGE_MAP.get(stage_raw, 1),
        "sector": SECTOR_MAP.get(sector_raw, 2),
        "funding": float(data.get("funding", 0.0)),
        "team_size": float(data.get("team_size", 3))
    }

    difficulty = float(data.get("difficulty", 0.5))

    result = generate_scenario(
        decoder=decoder,
        founder_profile=founder_profile,
        difficulty=difficulty,
        checkpoint=checkpoint,
        scenario_df=Scenario_DF
    )

    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "fraud_types": Scenario_DF["fraud_type"].nunique()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)