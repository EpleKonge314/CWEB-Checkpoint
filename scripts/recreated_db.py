import os, sqlite3, json, sys
wd = os.path.abspath(os.path.dirname(__file__) + "\\..")
db_path = os.path.join(wd, 'chat.db')
print('working dir:', wd)
if os.path.exists(db_path):
    try:
        os.remove(db_path)
        print('removed existing', db_path)
    except Exception as e:
        print('error removing file:', e)
        print('If the file is locked, stop the Flask server or any process using chat.db and try again.')
        sys.exit(2)
else:
    print('no existing chat.db')
# this took so many google searches to get this both the username and the delete function working correctly
sys.path.insert(0, wd)
from app import db, app
with app.app_context():
    db.create_all()
    print('db.create_all() called')

# tables
#I'm not entirely sure what this part does but hey, google says I need it and it seems to make sense for the most part
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('tables:', tables)
for t in tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    cols = cur.fetchall()
    print('\n--- TABLE', t)
    print('columns:', cols)
    cur.execute(f"SELECT rowid, * FROM {t} LIMIT 5")
    rows = cur.fetchall()
    print('rows (up to 5):')
    print(json.dumps(rows, default=str, indent=2))
conn.close()
print('\nDone')
