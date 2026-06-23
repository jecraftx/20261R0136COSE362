# FraudSim Setup

## Files You Need

Place these files in the same folder as `server.py`:

| File | Source |
|------|--------|
| `trained_vae.pt` | Download from Colab's file browser after training, or re-run the training cell |
| `fraud_scenarios_encoded.csv` | Same file the notebook pulls via gdown |

---

## Getting Started

### Backend Setup

**1. Install dependencies:**
```bash
pip install flask flask-cors torch pandas
```

**2. Start the server:**
```bash
python3 server.py
```

Flask will start on `http://localhost:5000`. Keep this terminal open.

**3. Verify it's running:**
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status": "ok", "fraud_types": 13}
```

### Frontend Setup

In a separate terminal (same folder):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`

---

## Troubleshooting

### Port 5000 Already in Use (Mac)

Disable **AirPlay Receiver** in System Settings → General → AirDrop & Handoff, then try again.

---

##  How It Works

The form sends **stage**, **sector**, **funding**, and **team size** to `POST /generate`. The server:
- Runs `generate_scenario()` (same as the notebook)
- Returns fraud type, risk level, summary, red flags, and correct action

The frontend builds 4 answer choices from that—the correct action plus 3 wrong ones, shuffled randomly.

**Difficulty scaling** works the same as the notebook:
- Correct answer: `d -= 0.0875`
- Wrong answer: `d += 0.0875`
- Clamped to `[0.1, 0.95]`

**Fallback mode:** If the server isn't running, the site uses 5 hardcoded demo scenarios so it doesn't fully break.

---

## Known Limitation

The model tends to predict only **3-4 fraud types out of 13** regardless of founder profile. This is mode collapse from the evaluation—the dataset was too small. The demo works fine, just don't expect high variety between different profiles.

