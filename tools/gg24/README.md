# Reproduce the GG24 funding track

The four records connect proposal registration, a dated progress report, a token distribution and the final retrospective. All default commands use the local fixtures and Python's standard library. Run them from the repository root.

~~~bash
python -B tools/gg24/build_track.py --check src/gg24-funding.mjs
python -B -m unittest discover -s tools/gg24
~~~

For a fresh public read, run each command below. The first downloads the two official Discourse posts. The second verifies the OP Mainnet transfer at a specific block hash and reads the token metadata at that block. The third verifies the registration transaction and recomputes the CIDv0 hash of the original DAG-PB metadata block.

~~~bash
python -B tools/gg24/gg24.py --verify-live
python -B tools/gg24/op_beleg.py --verify-live
python -B tools/gg24/vorschlag.py --verify-live
~~~

The tables report USD. An ERC-20 event records a separate quantity of 2,000 DAI. The distribution and registration match Gardens pool 178, proposal 7, the beneficiary, token and amount. The proposal title is bound through its CID. This covers one project in the final Pilot table. The public fixtures retain the specific receipt fields used by the checks. A fresh retrieval is required to rehash the original IPFS block.

[December progress report](https://gov.gitcoin.co/t/24912/1) · [May retrospective](https://gov.gitcoin.co/t/25276/1) · [OP registration](https://optimism.blockscout.com/tx/0x526c7c1c9440e0b7058a85af322a443e5e89cb1942014768faeb61ebf9e0c671) · [OP distribution](https://optimism.blockscout.com/tx/0x03c236561bf1cb5a88c14170478735dd0fd640c02debf3015430b13774022e35)
