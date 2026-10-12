"""Moves KEY=value lines from ../KEYS.txt into .env.local without printing values."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root.parent / "KEYS.txt"
env = root / ".env.local"
wanted = ["SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "RESEND_API_KEY", "BRIEF_RECIPIENT_EMAIL", "BRIEF_FROM_EMAIL"]
found = {}
for line in src.read_text().splitlines():
    m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
    if m and m.group(1) in wanted and m.group(2).strip():
        found[m.group(1)] = m.group(2).strip().strip('"').strip("'")
s = env.read_text()
for k, v in found.items():
    s = re.sub(rf"^{k}=.*$", lambda _: f"{k}={v}", s, flags=re.M) if re.search(rf"^{k}=", s, re.M) else s + f"\n{k}={v}\n"
env.write_text(s)
for k in wanted:
    v = found.get(k, "")
    hint = ""
    if k == "SUPABASE_SERVICE_ROLE_KEY" and v: hint = " (looks like secret key)" if v.startswith(("sb_secret_", "eyJ")) else " (UNEXPECTED FORMAT)"
    if k == "GEMINI_API_KEY" and v: hint = "" if v.startswith("AIza") or len(v) > 30 else " (UNEXPECTED FORMAT)"
    if k == "RESEND_API_KEY" and v: hint = "" if v.startswith("re_") else " (UNEXPECTED FORMAT)"
    print(f"{k}: {'set, ' + str(len(v)) + ' chars' + hint if v else 'MISSING'}")
print(" ".join(found))
