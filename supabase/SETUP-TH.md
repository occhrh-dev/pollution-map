# การเปิดระบบแยกหน่วยงานแบบมีบัญชีผู้ใช้

1. สร้างโครงการใหม่ใน Supabase และเปิด SQL Editor
2. นำไฟล์ `agency-schema.sql` ไปรันหนึ่งครั้ง
3. ไปที่ Authentication > Users แล้วสร้างบัญชีผู้ใช้ โดยไม่เปิดการสมัครสมาชิกสาธารณะ
4. เพิ่มหน่วยงานและผูกบัญชีด้วยคำสั่งตัวอย่างด้านล่าง โดยแทนค่าอีเมลและชื่อหน่วยงาน
5. นำ Project URL และ Publishable/anon key ใส่ใน `config.js` แล้วเผยแพร่เว็บไซต์ใหม่
6. ที่ Authentication > URL Configuration เพิ่ม `https://occhrh-dev.github.io/pollution-map/reset-password.html` ใน Redirect URLs เพื่อให้ปุ่มลืมรหัสผ่านทำงาน

ห้ามนำ `service_role` key, รหัสผ่านฐานข้อมูล หรือ Access token ใส่ใน GitHub

```sql
insert into public.organizations (name, slug)
values ('โรงพยาบาลตัวอย่าง', 'sample-hospital')
returning id;

insert into public.organization_members (organization_id, user_id, role)
select
  'UUID-หน่วยงานจากคำสั่งก่อนหน้า'::uuid,
  id,
  'admin'
from auth.users
where email = 'admin@example.org';
```

บทบาทมี 3 ระดับ: `admin` ลบและแก้ไขโครงการได้, `editor` สร้างและแก้ไขได้, `viewer` เปิดดูได้อย่างเดียว
