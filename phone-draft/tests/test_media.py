from phone_draft.media import REMOTE_DIR, remote_names


def test_remote_names_keep_order_and_extension_and_are_ascii():
    names = remote_names(["/a/封面.PNG", "/b/02.jpg", "/c/成片.mp4"], "1013T1200")
    assert names == [f"{REMOTE_DIR}/pd1013T1200_01.png", f"{REMOTE_DIR}/pd1013T1200_02.jpg", f"{REMOTE_DIR}/pd1013T1200_03.mp4"]
    assert all(n.isascii() for n in names)
