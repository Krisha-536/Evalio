import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from database.seed import seed_database, BANK

__all__ = ["seed_database", "BANK"]

if __name__ == "__main__":
    seed_database()
