import os

from phone_draft.html_parts import save_data_uri, split_images

ROOT = '<section id="wenyan" style="font-size: 16px">'


def wrap(*kids):
    return ROOT + "".join(kids) + "</section>"


def test_split_images_keeps_order_and_wraps_text_segments():
    html = wrap("<p>一</p>\n", '<p style="m"><img src="a.png" alt="x"></p>\n', "<h2>二</h2>", "<p>三</p>",
                '<p><img src="data:image/png;base64,QUJD"></p>')
    assert split_images(html) == [
        ("html", wrap("<p>一</p>")),
        ("image", "a.png"),
        ("html", wrap("\n<h2>二</h2><p>三</p>")),
        ("image", "data:image/png;base64,QUJD"),
    ]


def test_paragraph_with_text_and_image_is_not_split():
    html = wrap('<p>看图 <img src="a.png"></p>')
    assert split_images(html) == [("html", html)]


def test_no_images_is_one_segment():
    html = wrap("<p>一</p>")
    assert split_images(html) == [("html", html)]


def test_save_data_uri_writes_file_with_extension(tmp_path):
    path = save_data_uri("data:image/jpeg;base64,QUJD", str(tmp_path / "img01"))
    assert path.endswith("img01.jpg") and open(path, "rb").read() == b"ABC"
    assert os.path.exists(path)


from phone_draft.html_parts import body_complete, text_length


def test_text_length_ignores_tags_whitespace_and_images():
    html = wrap("<p>一 二&amp;</p>\n", '<p><img src="data:image/png;base64,QUJD"></p>', "<h2>三</h2>")
    assert text_length(html) == 4


def test_body_complete_fails_when_count_far_below_expected():
    assert body_complete(900, 1000)
    assert not body_complete(300, 1000)
    assert body_complete(None, 1000)  # 读不到字数时不判失败，由调用方提示人工核对
