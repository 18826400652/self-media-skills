from phone_draft.media import REMOTE_DIR, remote_names


def test_remote_names_keep_order_and_extension_and_are_ascii():
    names = remote_names(["/a/封面.PNG", "/b/02.jpg", "/c/成片.mp4"], "1013T1200")
    assert names == [f"{REMOTE_DIR}/pd1013T1200_01.png", f"{REMOTE_DIR}/pd1013T1200_02.jpg", f"{REMOTE_DIR}/pd1013T1200_03.mp4"]
    assert all(n.isascii() for n in names)


from phone_draft.media import newest_names, newest_matches

QUERY_OUT = """Row: 0 _display_name=pd1013T1200_02.png, date_added=1791946876, media_type=1
Row: 1 _display_name=pd1013T1200_01.png, date_added=1791946875, media_type=1
Row: 2 _display_name=P20261014-105545.jpg, date_added=1791946545, media_type=1
"""


def test_newest_names_parses_content_query_in_order():
    assert newest_names(QUERY_OUT) == ["pd1013T1200_02.png", "pd1013T1200_01.png", "P20261014-105545.jpg"]


def test_newest_matches_when_pushed_files_are_on_top():
    remotes = [f"{REMOTE_DIR}/pd1013T1200_01.png", f"{REMOTE_DIR}/pd1013T1200_02.png"]
    assert newest_matches(newest_names(QUERY_OUT), remotes)


def test_newest_does_not_match_when_a_new_photo_arrived():
    out = "Row: 0 _display_name=mmexport1791946999.jpg, date_added=1791946999, media_type=1\n" + QUERY_OUT
    remotes = [f"{REMOTE_DIR}/pd1013T1200_01.png", f"{REMOTE_DIR}/pd1013T1200_02.png"]
    assert not newest_matches(newest_names(out), remotes)
