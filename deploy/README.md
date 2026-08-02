# نشر e-Gurus OS على DigitalOcean عبر GitHub Actions

## 1) أسرار GitHub المطلوبة
Settings → Secrets and variables → Actions:

| Secret | القيمة |
| --- | --- |
| `DEPLOY_HOST` | IP الدروبلت |
| `DEPLOY_USER` | مستخدم SSH اللي بيشغّل سكربت النشر = **`egurus`** (نفس مستخدم الخدمة في `egurus-os.service`) |
| `DEPLOY_SSH_KEY` | المفتاح الخاص (ed25519) بالكامل |
| `DEPLOY_KNOWN_HOSTS` | ناتج `ssh-keyscan -H <IP>` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` | إعدادات الباك إند |
| `DEPLOY_HEALTH_URL` (اختياري) | رابط الفحص بعد النشر، الافتراضي `https://egurus.info/` |

المفتاح الخاص يُكتب في `~/.ssh` داخل الرَنر فقط، و`StrictHostKeyChecking=yes` مفعّل عبر `DEPLOY_KNOWN_HOSTS` لمنع MITM.

## 2) تجهيز السيرفر مرة واحدة

المستخدم واحد بس لكل حاجة: **`egurus`** — هو اللي بيتسجل دخول عبر SSH من GitHub Actions،
وهو اللي بيشغّل `/usr/local/bin/deploy-guru-recall`، وهو نفسه `User=egurus` في
`deploy/egurus-os.service`. مفيش مستخدم اسمه `deploy`.

```bash
# مستخدم النشر/التشغيل — محتاج شِل عشان SSH يقدر ينفّذ الأوامر
adduser --system --group --home /srv/egurus-os --shell /bin/bash egurus
mkdir -p /srv/egurus-os/{releases,repo}
chown -R egurus:egurus /srv/egurus-os

# مفتاح SSH العام الخاص بالنشر (المقابل لـ DEPLOY_SSH_KEY)
install -d -m 700 -o egurus -g egurus /srv/egurus-os/.ssh
install -m 600 -o egurus -g egurus /dev/null /srv/egurus-os/.ssh/authorized_keys
# الصق فيه المفتاح العام ed25519

# متغيرات التشغيل (سرّية) — لازم egurus يقدر يقراها لأن السكربت بيعمل لها source
install -m 640 -o root -g egurus /dev/null /etc/egurus-os.env
# أضف بداخله: VITE_SUPABASE_URL=..., VITE_SUPABASE_PUBLISHABLE_KEY=...,
#              VITE_SUPABASE_PROJECT_ID=..., SUPABASE_SERVICE_ROLE_KEY=...,
#              SUPABASE_URL=... (نفس قيمة VITE_SUPABASE_URL)
#              SUPABASE_PUBLISHABLE_KEY=... (نفس قيمة VITE_SUPABASE_PUBLISHABLE_KEY)
#              BOSTA_RECALL_SECRET=... (نفس القيمة المخزّنة في Vault باسم bosta_recall_secret), PORT=3000

# سكربت النشر + خدمة systemd
install -m 755 deploy/deploy-guru-recall.sh /usr/local/bin/deploy-guru-recall
install -m 644 deploy/egurus-os.service /etc/systemd/system/egurus-os.service
systemctl daemon-reload
systemctl enable egurus-os
```

### صلاحية `systemctl restart` بدون كلمة سر لمستخدم `egurus`
سكربت النشر بينادي `systemctl restart egurus-os` **مباشرة بدون `sudo`**، فالطريقة المطابقة
للسلوك ده هي قاعدة polkit تسمح لمستخدم `egurus` بإدارة الوحدة دي بس:

```bash
cat >/etc/polkit-1/rules.d/49-egurus-os.rules <<'EOF'
polkit.addRule(function(action, subject) {
  if (action.id == "org.freedesktop.systemd1.manage-units" &&
      action.lookup("unit") == "egurus-os.service" &&
      subject.user == "egurus") {
    return polkit.Result.YES;
  }
});
EOF
systemctl restart polkit
```

تحقّق: `sudo -u egurus systemctl restart egurus-os` لازم يرجع بدون ما يطلب كلمة سر.

**بديل بـ sudoers** (لو polkit مش متاح): اسمح للأمر المحدد فقط…

```
egurus ALL=(root) NOPASSWD: /bin/systemctl restart egurus-os, /bin/systemctl is-active egurus-os
```

…وفي الحالة دي لازم تعدّل `deploy/deploy-guru-recall.sh` عشان ينادي `sudo systemctl restart`
بدل `systemctl restart`، وإلا الاستدعاء المباشر هيفشل بصلاحيات.


## 3) ترتيب الاختبارات قبل systemd
1. **verify job** على GitHub: `npm ci` → `lint` → build بـ `NITRO_PRESET=node-server` → تشغيل `.output/server/index.mjs` والتأكد أنه يرد 200.
2. **فحص SSH**: اتصال بدون أي تغيير، ويتأكد أن `/usr/local/bin/deploy-guru-recall` موجود.
3. **على السيرفر**: بناء الإصدار الجديد في مجلد منفصل، ثم smoke test على بورت 3999.
4. فقط بعد نجاح كل ما سبق: تحويل السيملينك `current` ثم `systemctl restart`.
5. فحص صحة بعد إعادة التشغيل — أي فشل يرجع تلقائيًا للإصدار السابق (rollback).

## 4) تشغيل يدوي
Actions → Deploy to DigitalOcean → Run workflow.

## 5) متغيرات Supabase على السيرفر
كود السيرفر (auth middleware + admin client) بيقرأ `SUPABASE_URL` و`SUPABASE_PUBLISHABLE_KEY`
بدون بادئة `VITE_`. ملف `src/start.ts` بيعمل fallback تلقائي: لو الاسمين دول مش موجودين
بياخد القيم من `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` (و`VITE_SUPABASE_PROJECT_ID`).

الأفضل ضبط الاسمين معًا في `/etc/egurus-os.env` وفي `.do/app.yaml`:

| المتغير | الاستخدام |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | البناء والمتصفح |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | السيرفر (وإلا يعتمد على fallback الكود) |
| `SUPABASE_SERVICE_ROLE_KEY` | عمليات الأدمن على السيرفر فقط |
