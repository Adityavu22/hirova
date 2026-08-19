from app.services.ingestion import analyze_resume, extract_text


def test_text_ingestion_and_resume_analysis() -> None:
    # 1. The deterministic baseline should extract evidence without an API key.
    text = extract_text("resume.txt", b"Experience Product Designer. Skills: Figma, design systems, product strategy. Improved conversion 18%.")
    analysis = analyze_resume(text)
    assert "figma" in analysis["skills"]
    assert "design systems" in analysis["skills"]
    assert analysis["metric_evidence"] == 1
    assert analysis["score"] >= 50


def test_rejects_unknown_document_type() -> None:
    # 2. File-type validation happens before parser dispatch.
    try:
        extract_text("resume.exe", b"not a document")
    except ValueError as exc:
        assert "Unsupported" in str(exc)
    else:
        raise AssertionError("Expected unsupported type failure")
