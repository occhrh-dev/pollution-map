# เปิดใช้ Google Login

ระบบไม่เก็บรหัสผ่าน ผู้ใช้เข้าสู่ระบบด้วยบัญชี Google จากนั้น Apps Script จะตรวจอีเมล บทบาท และหน่วยงานจาก Google Sheet กลาง ส่วนไฟล์แผนที่จะถูกสร้างใน Google Drive ของผู้ใช้ด้วยสิทธิ์ `drive.file` แต่ละบัญชีจึงเห็นเฉพาะโครงการที่บัญชีนั้นบันทึกภายในหน่วยงานที่ได้รับสิทธิ์

## 1. สร้าง OAuth Client ID

1. เปิด Google Cloud Console และเลือกหรือสร้างโปรเจกต์
2. เปิดใช้งาน Google Drive API
3. ตั้งค่า OAuth consent screen
4. สร้าง Credentials ชนิด OAuth client ID > Web application
5. เพิ่ม Authorized JavaScript origins:
   - `https://occhrh-dev.github.io`
   - `http://127.0.0.1:8765` สำหรับทดสอบในเครื่อง
6. คัดลอก Client ID ที่ลงท้ายด้วย `.apps.googleusercontent.com`

ห้ามนำ Client Secret ใส่ใน GitHub

## 2. สร้าง Apps Script Web App

1. เปิด Apps Script แล้วสร้างโปรเจกต์ใหม่
2. นำเนื้อหา `apps-script/Code.gs` ไปวางใน `Code.gs`
3. เปิด Project Settings > Script properties และเพิ่ม:
   - Property: `GOOGLE_CLIENT_ID`
   - Value: Client ID จากขั้นตอนที่ 1
4. นำค่าใน `apps-script/appsscript.json` ไปใช้เป็น manifest
5. Deploy > New deployment > Web app
6. Execute as: Me
7. Who has access: Anyone
8. กด Deploy และคัดลอก URL ที่ลงท้ายด้วย `/exec`

## 3. เชื่อมหน้าเว็บ

แก้ `config.js`:

```js
window.POLLUTION_MAP_CONFIG = {
  googleClientId: 'CLIENT_ID.apps.googleusercontent.com',
  appsScriptWebAppUrl: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec'
};
```

ค่าทั้งสองเป็นค่าระบุตัวบริการที่เปิดเผยบนหน้าเว็บได้ แต่ห้ามใส่ Client Secret, access token, รหัสผ่าน หรือ service-account key

## 4. ทดสอบ

1. เปิด `login.html`
2. เข้าด้วย `occ.hrh@gmail.com`
3. อนุญาต Google Drive
4. ต้องเห็นพื้นที่ทำงาน `งานอาชีวเวชกรรม เฉลิมพระเกียรติฯ ระยอง`
5. สร้างและบันทึกโครงการ จากนั้นตรวจว่าไฟล์อยู่ในโฟลเดอร์ `Pollution Map - งานอาชีวเวชกรรม เฉลิมพระเกียรติฯ ระยอง` ภายใน My Drive ของบัญชีที่เข้าสู่ระบบ
