def test_pipeline_transcribe_requires_auth(client):
    """Pipeline transcribe endpoint requires authentication."""
    response = client.post("/api/v1/pipeline/transcribe")
    assert response.status_code in (401, 422)

def test_pipeline_translate_requires_auth(client):
    response = client.post("/api/v1/pipeline/translate")
    assert response.status_code in (401, 422)

def test_pipeline_synthesize_requires_auth(client):
    response = client.post("/api/v1/pipeline/synthesize")
    assert response.status_code in (401, 422)

def test_pipeline_voices_requires_auth(client):
    response = client.get("/api/v1/pipeline/voices")
    assert response.status_code in (401, 422)
