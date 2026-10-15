# GIT — cộng tác và PR

Đây là quy ước cho repo sản phẩm khi được init Git, không tự yêu cầu biến workspace tài liệu/source khách hàng thành repo công khai.

- **GIT-01 MUST [ALWAYS] — Bảo toàn thay đổi:** đọc status/diff trước sửa; không reset/revert/force-push hoặc xóa thay đổi của người khác. Chưa có Git thì ghi rõ và làm theo phạm vi file; không bịa branch/diff. Không tự publish remote hoặc commit nếu task không yêu cầu.
- **GIT-02 SHOULD [FEATURE:collaboration] — Chia việc:** một branch cho một task, tên `feat/<task>-<slug>`, `fix/...` hoặc `docs/...`; PR nhỏ theo một hành vi. Commit mô tả lý do/hành vi, có thể dùng `feat(projects): ...`. Không đưa refactor không liên quan vào PR sửa bug.
- **GIT-03 MUST [FEATURE:collaboration] — Nội dung PR:** nêu vấn đề và hành vi sau sửa, gate/feature đang bàn giao, dữ liệu fake/live, rule áp dụng, kiểm tra đã chạy/chưa chạy, ảnh UI nếu cần và migration/rollback nếu có. Template ở [pr-template.md](../pr-template.md). Chưa có host Git thì dùng cùng mẫu trong bàn giao task.
- **GIT-04 MUST [FEATURE:collaboration] — Review:** người khác review trước merge vào branch dùng chung; AI review hỗ trợ, không thay quyết định của người phụ trách. Findings được sửa bằng implement rồi kiểm tra lại phần liên quan. CI đỏ/kiểm tra thiết yếu chưa chạy không được ghi pass; thay đổi sau review cần review lại theo mức ảnh hưởng.
- **GIT-05 MUST [ALWAYS] — Nội dung repo:** không commit source khách hàng, .env có secret, dữ liệu runtime, log thô, node_modules hoặc output build. Khi init tạo ignore phù hợp trước commit đầu; fixture chỉ là dữ liệu sạch được phép dùng. Dependency change đi cùng lockfile, không commit lockfile do tool tự đổi ngoài task.

Branch protection/CI sẽ cấu hình khi repo/remote được tạo; có quy ước không có nghĩa kiểm soát tự động đã tồn tại. Chưa có host không chặn viết code local, nhưng không được tuyên bố đã qua PR review.
