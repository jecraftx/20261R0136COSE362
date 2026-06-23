# FraudSim setup

## Files you need in this folder

- `trained_vae.pt` - download from Colab's file browser after training, or just re-run the training cell
- `fraud_scenarios_encoded.csv` - same file the notebook pulls via gdown

Both go in the same folder as `server.py`.

## Starting the backend

pip install flask flask-cors torch pandas

python3 server.py

Flask starts on `http://localhost:5000`. Keep this terminal open.

To check it's running, open another terminal:

curl http://localhost:5000/health

Should return `{"status": "ok", "fraud_types": 13}`.

## Starting the website

In a separate terminal, same folder:

python3 -m http.server 8080

Then go to `http://localhost:8080/index.html`.

## If port 5000 is taken (Mac)

Disable AirPlay Receiver in System Settings → General → AirDrop & Handoff, then try again.

## How it works

The form sends stage, sector, funding and team size to `POST /generate`. The server runs `generate_scenario()` (same as the notebook) and sends back the fraud type, risk level, summary, red flags and correct action. The frontend builds 4 answer choices from that, the real correct action plus 3 wrong ones, shuffled. After each answer, difficulty updates the same way as the notebook (`d -= 0.0875` / `d += 0.0875`, clamped to [0.1, 0.95]).

If the server isn't running, the site falls back to 5 hardcoded demo scenarios so it doesn't fully break.

## Known issue

The model tends to predict only 3-4 fraud types out of 13 regardless of the founder profile. This is the mode collapse from the evaluation, dataset was too small. The demo works fine, just don't expect much variety between different profiles.

