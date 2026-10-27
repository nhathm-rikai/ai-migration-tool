# Specification design — Knowledge Base sau review

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.4.0-draft.

[Thứ tự đọc và nguồn quy định](README.md).

## 14. Knowledge Base v1

SD-KB-01: chỉ index artifact/version đã được người có thẩm quyền duyệt; draft/rejected tách riêng, không dùng như tri thức đã xác nhận. Hypothesis được chấp nhận có điều kiện vẫn giữ nhãn khi truy xuất.

SD-KB-02: metadata tối thiểu gồm project/program ID, loại tài liệu, section/BR ID, artifact version, source hash, rule version, review record và evidence references. Chunk không được làm mất điều kiện/ngoại lệ quan trọng.

SD-KB-03: truy xuất lọc đúng project/program/source revision và approval; không lấy ngầm latest hoặc lẫn chương trình khác. Source đổi thì đánh dấu stale, review lại trước dùng làm baseline mới.

SD-KB-04: đề xuất bắt đầu bằng repo + index/search có lọc metadata; kế hoạch cho phép repo hoặc Vector DB. Chỉ lưu thư mục Markdown chưa chứng minh có RAG: phải kiểm thử truy xuất câu hỏi theo program và trả đúng artifact/section/version đã duyệt, kèm trace. Không tuyên bố fine-tune/học trọng số model.
