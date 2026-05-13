from unittest.mock import MagicMock, patch

from bson import ObjectId


def test_upload_returns_string_id():
    mock_bucket = MagicMock()
    fake_id = ObjectId()
    mock_bucket.put.return_value = fake_id

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import upload_to_gridfs

        result = upload_to_gridfs(b"hello", "test.pdf", {"type": "evidence"})

    assert result == str(fake_id)
    mock_bucket.put.assert_called_once_with(
        b"hello", filename="test.pdf", metadata={"type": "evidence"}
    )


def test_delete_calls_bucket_delete():
    mock_bucket = MagicMock()
    fake_id = ObjectId()

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import delete_from_gridfs

        delete_from_gridfs(str(fake_id))

    mock_bucket.delete.assert_called_once_with(fake_id)


def test_stream_yields_chunks():
    mock_bucket = MagicMock()
    mock_grid_out = MagicMock()
    mock_grid_out.read.side_effect = [b"chunk1", b"chunk2", b""]
    mock_bucket.get.return_value = mock_grid_out

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import stream_from_gridfs

        chunks = list(stream_from_gridfs(str(ObjectId())))

    assert chunks == [b"chunk1", b"chunk2"]
