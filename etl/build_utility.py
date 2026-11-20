"""How to pay a City of Kannapolis utility bill (machine-parsed from kannapolisnc.gov/customer-service)."""
from __future__ import annotations

import json

from common import MANUAL, write_json


def main() -> None:
    info = json.loads((MANUAL / "utility_billing.json").read_text())
    t, fee = info["terms"], info["card_fee"]
    if not (t["past_due_day"] < t["late_fee_day"] < t["disconnect_day"]) or not (0 < fee["rate"] < 0.1):
        raise ValueError("utility_billing.json: payment terms or card fee look wrong")
    write_json("utility.json", info)


if __name__ == "__main__":
    main()
