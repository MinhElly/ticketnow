# Keycloak local tự cấu hình

## Các file

- `ticketnow-realm.json`: realm, realm roles, public client Postman, audience và tài khoản demo.
- `../docker-compose.yml`: mount thư mục này vào `/opt/keycloak/data/import` và chạy `start-dev --import-realm`.
- `../.env.example`: mẫu biến môi trường, không chứa bí mật thực tế.

## Khởi động lần đầu

Từ thư mục gốc repository:

```powershell
# Chỉ copy khi chưa có .env; giữ nguyên file nếu đã cấu hình MariaDB.
if (-not (Test-Path deploy/compose/.env)) {
    Copy-Item deploy/compose/.env.example deploy/compose/.env
}
```

Điền DB_ROOT_PASSWORD, DB_PASSWORD và thêm các dòng sau vào `deploy/compose/.env`:

```dotenv
KC_ADMIN_USERNAME=admin
KC_ADMIN_PASSWORD=your-local-admin-password
KC_DEMO_PASSWORD=your-local-demo-password
```

```powershell
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml up -d keycloak
docker compose --env-file deploy/compose/.env -f deploy/compose/docker-compose.yml logs -f keycloak
```

Chờ log import realm `ticketnow` thành công và server lắng nghe. Ctrl+C thoát theo dõi log, không dừng container.
Kiểm tra discovery endpoint, không cần mở Admin Console:

```powershell
Invoke-RestMethod http://localhost:8180/realms/ticketnow/.well-known/openid-configuration |
    Select-Object issuer, authorization_endpoint, token_endpoint, jwks_uri
```

## Cấu hình được tạo

| Thành phần | Giá trị |
| --- | --- |
| Realm | ticketnow |
| Realm roles | customer, organizer, admin |
| Public client | ticketnow-postman |
| Authorization flow | Authorization Code + PKCE S256 |
| Redirect URI | https://oauth.pstmn.io/v1/callback |
| Access-token audience | ticketnow-api |
| User customer01 | role customer |
| User organizer01 | role organizer |
| User admin01 | role admin |

Ba user demo có mật khẩu KC_DEMO_PASSWORD. Nếu không đặt, Compose dùng LocalDemo_2026 cho local.
Keycloak thay placeholder `${KC_DEMO_PASSWORD}` trong JSON bằng biến môi trường khi import.
Các user này chỉ dùng cho môi trường local. admin01 là admin ứng dụng TicketNow;
KC_ADMIN_USERNAME là quản trị Keycloak trong realm master, là hai tài khoản khác nhau.

Không cần tạo client riêng cho Gateway/Event Service khi hai ứng dụng chỉ xác thực JWT.
Các ứng dụng dùng issuer-uri `http://localhost:8180/realms/ticketnow` và audience `ticketnow-api`.

## Lấy token bằng Postman

Authorization > OAuth 2.0 > Get New Access Token:

- Grant Type: Authorization Code (With PKCE)
- Callback URL: https://oauth.pstmn.io/v1/callback
- Auth URL: http://localhost:8180/realms/ticketnow/protocol/openid-connect/auth
- Access Token URL: http://localhost:8180/realms/ticketnow/protocol/openid-connect/token
- Client ID: ticketnow-postman
- Client Secret: để trống
- Scope: openid profile email
- Code Challenge Method: SHA-256

Đăng nhập bằng organizer01 và mật khẩu demo, chọn Use Token.
Gọi API qua Gateway bằng access token, không dùng ID token.
Role được đưa vào realm_access.roles; backend phải cấu hình ánh xạ role khi phân quyền.
Direct Access Grants bị tắt, nên grant_type=password sẽ không hoạt động.

## Khi realm đã tồn tại

Startup import BỎ QUA realm đã tồn tại. Nó không đồng bộ những chỉnh sửa trong JSON.
Nếu trước đây đã tạo ticketnow thủ công, restart không cập nhật client/role/user/mật khẩu.
Thay đổi KC_DEMO_PASSWORD trong .env cũng không đổi mật khẩu user đã được import.
Bootstrap admin variables chỉ tạo tài khoản ban đầu, không tự đổi mật khẩu tài khoản hiện hữu.

Để cập nhật realm đang dùng và giữ dữ liệu, dùng Admin API/kcadm với script cập nhật có kiểm soát.
Để thử JSON mới mà vẫn giữ cấu hình hiện tại, chạy một instance Keycloak khác với database/volume mới.
Không chạy `docker compose down -v` cho toàn bộ stack: lệnh đó cũng xóa volume MariaDB.

## Chia sẻ repository

Commit JSON, Compose, README và .env.example; không commit .env.
Người mới clone repo, tạo .env rồi chạy Compose là được khởi tạo cùng cấu hình.
Cấu hình start-dev và user demo dành cho local; không dùng nguyên bộ seed này cho production.

Tài liệu: https://www.keycloak.org/server/importExport
