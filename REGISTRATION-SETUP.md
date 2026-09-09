# ระบบขอสิทธิ์เข้าใช้งาน

ฟีเจอร์นี้ต่อยอด Google Login เดิม โดยให้ผู้ใช้ยืนยันตัวตนด้วย Google แล้วส่งคำขอให้ ADMIN อนุมัติ ไม่มีการสร้างหรือเก็บรหัสผ่านใหม่

## สิ่งที่เปลี่ยน

- `registration.html`: ยืนยัน Google เลือกหน่วยงาน และส่งคำขอ
- `login.html`: เพิ่มลิงก์ขอสิทธิ์
- `admin.html`: เพิ่มคิวคำขอและเลือกบทบาทก่อนอนุมัติ
- `apps-script/Code.gs`: เพิ่ม `listRegistrationAgencies`, `requestAccess`, `listRegistrationRequests`, `reviewRegistration`
- Google Sheet เดิม: เพิ่มแท็บ `REGISTRATION_REQUESTS` โดยไม่แก้ข้อมูลสมาชิกเดิม

## โครงสร้างแท็บ REGISTRATION_REQUESTS

ชื่อคอลัมน์ต้องตรงและเรียงตามลำดับนี้:

`request_id, email, display_name, requested_agency_id, status, requested_at, reviewed_at, reviewed_by, assigned_role, note, google_sub`

สถานะคือ `PENDING`, `APPROVED`, `REJECTED` ส่วนบทบาทคือ `VIEWER`, `EDITOR`, `ADMIN` ผู้สมัครกำหนดบทบาทเองไม่ได้ และการอนุมัติจะผูกบัญชีกับ Google `sub` ที่ตรวจสอบแล้ว หากคำขอเก่าที่ไม่มี `google_sub` จะใช้กลไก `PENDING:email` เดิม

## การนำขึ้นใช้งาน

1. ตรวจสอบและ merge branch ฟีเจอร์เข้ากับ `main` หลังทดสอบแล้ว อย่าเปลี่ยน production ก่อนตรวจความพร้อม
2. เปิด Apps Script project เดิมที่ใช้กับ Pollution Map และสำรอง `Code.gs` ปัจจุบันไว้
3. นำ `apps-script/Code.gs` เวอร์ชันใหม่ไปแทนที่ในโปรเจกต์เดิม ห้ามสร้าง Web App ใหม่โดยไม่จำเป็น เพราะอาจทำให้ URL และ Script Properties เดิมเปลี่ยน
4. ตรวจสอบ Script Property `GOOGLE_CLIENT_ID` ว่ายังเป็น OAuth Client ID เดิม และตรวจสอบ manifest/scopes เดิม
5. Deploy > Manage deployments > Edit deployment เดิม > Version: New version > Deploy เพื่อให้ URL `/exec` เดิมชี้ไปยังโค้ดใหม่ การบันทึก Code.gs อย่างเดียวไม่อัปเดต version ที่ deploy แล้ว
6. ตรวจสอบว่า `config.js` ยังชี้ไปที่ Web App deployment ที่ถูกต้อง และ Google OAuth Authorized JavaScript origins มี origin ของเว็บไซต์ที่ใช้จริง
7. เปิดหน้า Login และทดสอบด้วยบัญชีทดสอบที่ยังไม่มีสิทธิ์ โดยไม่ใช้บัญชี ADMIN หลักในการทดสอบสมัครใหม่

## การทดสอบที่ต้องผ่าน

- บัญชี ADMIN เดิมเข้าสู่ระบบได้ตามปกติ
- บัญชีใหม่เลือกหน่วยงานและส่งคำขอแล้วมีแถว `PENDING` พร้อม Google sub
- ส่งคำขอซ้ำแล้วไม่เกิดคำขอ PENDING ซ้ำ
- ผู้สมัครยังเข้าพื้นที่ทำงานไม่ได้ก่อนอนุมัติ
- บัญชี VIEWER/EDITOR เรียก API พิจารณาคำขอไม่ได้
- ADMIN เห็นเฉพาะคำขอของหน่วยงานที่ตนมีสิทธิ์
- ADMIN อนุมัติเป็น VIEWER แล้วผู้สมัครเข้าสู่ระบบได้ด้วยบัญชีเดิม
- การเปลี่ยน role ใน request จาก browser ไม่สามารถยกระดับสิทธิ์ได้
- การปฏิเสธไม่สร้างสมาชิก ACTIVE
- คำขอที่พิจารณาแล้วไม่สามารถอนุมัติซ้ำ
- บัญชี DISABLED ไม่สามารถสมัครเพื่อเปิดสิทธิ์กลับเองได้
- การเพิ่มสมาชิกโดยตรงและการจัดการโครงการเดิมยังทำงานได้

## ข้อควรระวัง

Google Sheet เป็นทะเบียนสิทธิ์กลาง ไม่ควรแชร์สิทธิ์แก้ไขให้ผู้สมัครทั่วไป ใช้สิทธิ์ ADMIN ผ่าน API ที่ตรวจ token บน server เท่านั้น การอนุมัติยังไม่ใช่การแชร์ไฟล์ Google Drive ระหว่างผู้ใช้: ระบบเดิมใช้ `drive.file` และแยกไฟล์ตามบัญชี ดังนั้นหากต้องการให้หลายคนแก้โครงการเดียวกัน ต้องออกแบบสิทธิ์การแชร์ Drive เพิ่มต่างหาก

ระบบนี้เป็นเวอร์ชันแรกสำหรับคำขอและอนุมัติ ยังไม่มีอีเมลแจ้งเตือนอัตโนมัติ, CAPTCHA, การจำกัดจำนวนคำขอระดับ IP, หรือระบบกู้คืนเมื่อเกิดข้อผิดพลาดกลางธุรกรรม Google Sheets/Apps Script จึงควรทดสอบกับบัญชีทดสอบและตรวจ AUDIT_LOG ก่อนเปิดรับผู้ใช้จำนวนมาก
