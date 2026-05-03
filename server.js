/**
 * ================================
 *  AQUALINK v5 - COMPLETE APP
 *  One file. Everything included.
 *
 *  Run:   node server.js
 *  Open:  localhost:3000
 *
 *  Admin: admin@aqualink.org / admin123
 * ================================
 */

var http   = require('http');
var fs     = require('fs');
var path   = require('path');
var crypto = require('crypto');

var PORT   = process.env.PORT || 3000;
var SECRET = 'aqualink2026';
var DBFILE = path.join(__dirname, 'database.json');

// ─── DATABASE ─────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DBFILE)) return { users: [], bookings: [], suppliers: [] };
  try { return JSON.parse(fs.readFileSync(DBFILE, 'utf8')); }
  catch (e) { return { users: [], bookings: [], suppliers: [] }; }
}
function saveDB(db) { fs.writeFileSync(DBFILE, JSON.stringify(db, null, 2)); }
function makeId() { return crypto.randomBytes(6).toString('hex'); }
function hashPassword(pw) { return crypto.createHmac('sha256', SECRET).update(pw).digest('hex'); }
function makeToken(u) {
  var data = JSON.stringify({ id: u.id, role: u.role, exp: Date.now() + 7 * 86400000 });
  var payload = Buffer.from(data).toString('base64');
  var sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64');
  return payload + '.' + sig;
}
function checkToken(tok) {
  if (!tok) return null;
  var parts = (tok || '').split('.');
  if (parts.length !== 2) return null;
  var payload = parts[0], sig = parts[1];
  if (crypto.createHmac('sha256', SECRET).update(payload).digest('base64') !== sig) return null;
  try { var d = JSON.parse(Buffer.from(payload, 'base64').toString()); return d.exp > Date.now() ? d : null; }
  catch (e) { return null; }
}
function getToken(req) { return (req.headers['authorization'] || '').replace('Bearer ', '') || null; }
function getBody(req) {
  return new Promise(function (resolve) {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); } });
  });
}
function nextBookingId() {
  var db = loadDB();
  var max = 0;
  db.bookings.forEach(function (b) { var n = parseInt((b.id || 'AQL-0').replace('AQL-', '')) || 0; if (n > max) max = n; });
  return 'AQL-' + String(max + 1).padStart(5, '0');
}

// ─── SEED DATA ────────────────────────────────────────
function seedData() {
  var db = loadDB();
  if (db.users.length > 0) return;
  var adminId = makeId(), ngoId = makeId();
  db.users = [
    { id: adminId, name: 'Admin User', email: 'admin@aqualink.org', passwordHash: hashPassword('admin123'), role: 'admin', organization: 'AquaLink HQ', country: 'Global', userType: 'admin', createdAt: new Date().toISOString() },
    { id: ngoId, name: 'WaterAid Nigeria', email: 'ngo@wateraid.org', passwordHash: hashPassword('test123'), role: 'ngo', organization: 'WaterAid', country: 'Nigeria', userType: 'consumer', createdAt: new Date().toISOString() }
  ];
  db.bookings = [
    { id: 'AQL-00001', userId: ngoId, destination: 'Lagos, Nigeria', waterType: 'Potable', volumeLitres: 50000, priority: 'Emergency', status: 'active', requestorType: 'NGO', requiredBy: '2026-05-02', notes: 'Flood relief', createdAt: new Date().toISOString() },
    { id: 'AQL-00002', userId: ngoId, destination: 'Nairobi, Kenya', waterType: 'Potable', volumeLitres: 120000, priority: 'Urgent', status: 'transit', requestorType: 'Government', requiredBy: '2026-05-05', notes: '', createdAt: new Date().toISOString() },
    { id: 'AQL-00003', userId: ngoId, destination: 'Dhaka, Bangladesh', waterType: 'Agricultural', volumeLitres: 800000, priority: 'Standard', status: 'pending', requestorType: 'Government', requiredBy: '2026-05-10', notes: 'Irrigation', createdAt: new Date().toISOString() }
  ];
  db.suppliers = [];
  saveDB(db);
}


// ─── EMAIL SYSTEM (Resend API) ───────────────────────
var RESEND_KEY = process.env.RESEND_KEY || 're_EiMBpMft_AuK6VCRGB7RaUUWfxR3JD2KJ';
var PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC || 'pk_test_f01988149ae68d04ac03ed5f5ed887af26ce3787';
var PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || 'sk_test_5d4f5870cc2f185648fc85d2563ee0086094f8a7';
var ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'aqualink79@gmail.com';
var FROM_EMAIL = 'onboarding@resend.dev';

function sendEmail(toEmail, subject, htmlBody) {
  return new Promise(function(resolve) {
    try {
      var https = require('https');
      var payload = JSON.stringify({
        from: 'AquaLink <' + FROM_EMAIL + '>',
        to: [toEmail],
        subject: subject,
        html: htmlBody
      });
      var options = {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(c) { data += c; });
        res.on('end', function() {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ Email sent to: ' + toEmail);
            resolve(true);
          } else {
            console.log('❌ Email failed: ' + res.statusCode + ' ' + data);
            resolve(false);
          }
        });
      });
      req.on('error', function(e) {
        console.log('❌ Email error: ' + e.message);
        resolve(false);
      });
      req.write(payload);
      req.end();
    } catch(e) {
      console.log('❌ Email exception: ' + e.message);
      resolve(false);
    }
  });
}

function emailWrap(body) {
  return '<!DOCTYPE html><html><head><meta charset=UTF-8><style>' +
    'body{margin:0;padding:20px;background:#f0f4f8;font-family:Arial,sans-serif}' +
    '.wrap{max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)}' +
    '.head{background:linear-gradient(135deg,#1578c8,#00e5ff);padding:28px;text-align:center}' +
    '.head h1{color:#010b14;font-size:1.6rem;letter-spacing:3px;margin:0}' +
    '.head p{color:#010b14;font-size:.85rem;margin-top:4px;opacity:.8}' +
    '.body{padding:28px}' +
    '.body h2{color:#1578c8;font-size:1.1rem;margin-bottom:12px}' +
    '.body p{color:#333;font-size:.9rem;line-height:1.6;margin-bottom:12px}' +
    'table{width:100%;border-collapse:collapse;margin:16px 0}' +
    'td{padding:10px 12px;border-bottom:1px solid #f0f4f8;font-size:.88rem}' +
    'td:first-child{color:#4a7a9b;font-weight:600;width:38%}' +
    'td:last-child{color:#021525;font-weight:500}' +
    '.cta{display:inline-block;margin-top:16px;padding:13px 30px;background:linear-gradient(135deg,#1578c8,#00e5ff);color:#010b14;text-decoration:none;border-radius:100px;font-weight:700;font-size:.88rem}' +
    '.foot{background:#f8fafb;padding:16px;text-align:center;font-size:.75rem;color:#4a7a9b;border-top:1px solid #eee}' +
    '</style></head><body><div class=wrap>' +
    '<div class=head><h1>AQUALINK</h1><p>Global Water Distribution Platform</p></div>' +
    '<div class=body>' + body + '</div>' +
    '<div class=foot>AquaLink Global &bull; aqualink79@gmail.com &bull; This is an automated message</div>' +
    '</div></body></html>';
}

function fmtVol(l) {
  return l>=1000000?(l/1000000).toFixed(1)+'M L':l>=1000?(l/1000).toFixed(0)+'K L':l+' L';
}

function sendBookingEmails(booking, userName, userEmail) {
  var adminBody = emailWrap(
    '<h2>🚨 New Water Booking!</h2>' +
    '<p>A new booking was just submitted on AquaLink.</p>' +
    '<table>' +
    '<tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">' + booking.id + '</td></tr>' +
    '<tr><td>From</td><td>' + userName + '</td></tr>' +
    '<tr><td>Email</td><td>' + userEmail + '</td></tr>' +
    '<tr><td>Destination</td><td>' + booking.destination + '</td></tr>' +
    '<tr><td>Water Type</td><td>' + booking.waterType + '</td></tr>' +
    '<tr><td>Volume</td><td>' + fmtVol(booking.volumeLitres) + '</td></tr>' +
    '<tr><td>Priority</td><td style="color:' + (booking.priority==='Emergency'?'#ff6b6b':booking.priority==='Urgent'?'#ffd166':'#4a7a9b') + ';font-weight:700">' + booking.priority + '</td></tr>' +
    '<tr><td>Est. Delivery</td><td>' + booking.estimatedDelivery + '</td></tr>' +
    '<tr><td>Notes</td><td>' + (booking.notes||'None') + '</td></tr>' +
    '</table>' +
    '<a class=cta href="https://aqualink-1.onrender.com">Open Dashboard →</a>'
  );
  var customerBody = emailWrap(
    '<h2>✅ Your Booking is Confirmed!</h2>' +
    '<p>Thank you for using AquaLink, <strong>' + userName + '</strong>. Your water booking has been received and is being processed.</p>' +
    '<table>' +
    '<tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">' + booking.id + '</td></tr>' +
    '<tr><td>Destination</td><td>' + booking.destination + '</td></tr>' +
    '<tr><td>Water Type</td><td>' + booking.waterType + '</td></tr>' +
    '<tr><td>Volume</td><td>' + fmtVol(booking.volumeLitres) + '</td></tr>' +
    '<tr><td>Priority</td><td>' + booking.priority + '</td></tr>' +
    '<tr><td>Est. Delivery</td><td>' + booking.estimatedDelivery + '</td></tr>' +
    '<tr><td>Status</td><td>Pending — being processed</td></tr>' +
    '</table>' +
    '<p>Our team will contact you within 24 hours to coordinate delivery.</p>' +
    '<p>Questions? Email us at <a href="mailto:aqualink79@gmail.com">aqualink79@gmail.com</a></p>' +
    '<a class=cta href="https://aqualink-1.onrender.com">Track Your Booking →</a>'
  );
  sendEmail(ADMIN_EMAIL, '🚨 New Booking ' + booking.id + ' — ' + booking.priority + ' — ' + booking.destination, adminBody);
  sendEmail(userEmail, '✅ AquaLink Booking Confirmed — ' + booking.id, customerBody);
}

function sendWelcomeEmail(user) {
  var adminBody = emailWrap(
    '<h2>👤 New ' + (user.userType==='supplier'?'Supplier':'User') + ' Registered!</h2>' +
    '<table>' +
    '<tr><td>Name</td><td>' + user.name + '</td></tr>' +
    '<tr><td>Email</td><td>' + user.email + '</td></tr>' +
    '<tr><td>Type</td><td>' + (user.userType==='supplier'?'🚚 Water Supplier':'💧 Consumer') + '</td></tr>' +
    '<tr><td>Organization</td><td>' + (user.organization||'—') + '</td></tr>' +
    '<tr><td>Country</td><td>' + (user.country||'—') + '</td></tr>' +
    '</table>' +
    '<a class=cta href="https://aqualink-1.onrender.com">View Dashboard →</a>'
  );
  sendEmail(ADMIN_EMAIL, '👤 New ' + (user.userType==='supplier'?'Supplier':'User') + ' — ' + user.name + ' from ' + (user.country||'?'), adminBody);

  var userBody;
  if (user.userType === 'supplier') {
    userBody = emailWrap(
      '<h2>🚚 Welcome to AquaLink Suppliers!</h2>' +
      '<p>Thank you for applying as a water supplier, <strong>' + user.name + '</strong>!</p>' +
      '<p>Your application has been received. Here is what happens next:</p>' +
      '<table>' +
      '<tr><td>Step 1</td><td>Our team reviews your application within 24 hours</td></tr>' +
      '<tr><td>Step 2</td><td>We verify your water supply capacity</td></tr>' +
      '<tr><td>Step 3</td><td>You receive your Verified Supplier badge</td></tr>' +
      '<tr><td>Step 4</td><td>You start receiving booking requests</td></tr>' +
      '</table>' +
      '<p>Questions? Email us at <a href="mailto:aqualink79@gmail.com">aqualink79@gmail.com</a></p>'
    );
  } else {
    userBody = emailWrap(
      '<h2>💧 Welcome to AquaLink, ' + user.name + '!</h2>' +
      '<p>Your account is ready. You can now book clean water for your community or organization.</p>' +
      '<table>' +
      '<tr><td>Email</td><td>' + user.email + '</td></tr>' +
      '<tr><td>Organization</td><td>' + (user.organization||'—') + '</td></tr>' +
      '<tr><td>Country</td><td>' + (user.country||'—') + '</td></tr>' +
      '</table>' +
      '<p>You can now:<br>✅ Book water for your community<br>✅ Track deliveries in real time<br>✅ Request emergency water supplies</p>' +
      '<a class=cta href="https://aqualink-1.onrender.com">Book Water Now →</a>'
    );
  }
  sendEmail(user.email, user.userType==='supplier'?'🚚 AquaLink Supplier Application Received':'💧 Welcome to AquaLink — Your Account is Ready', userBody);
}

function sendPaymentEmail(booking, userName, userEmail, amount, currency) {
  var adminBody = emailWrap(
    '<h2>💳 Payment Received!</h2>' +
    '<p>A payment has been confirmed on AquaLink.</p>' +
    '<table>' +
    '<tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">' + booking.id + '</td></tr>' +
    '<tr><td>Customer</td><td>' + userName + '</td></tr>' +
    '<tr><td>Email</td><td>' + userEmail + '</td></tr>' +
    '<tr><td>Amount Paid</td><td style="color:#06d6a0;font-weight:700">' + currency + ' ' + amount.toLocaleString() + '</td></tr>' +
    '<tr><td>Reference</td><td>' + booking.paymentRef + '</td></tr>' +
    '<tr><td>Destination</td><td>' + booking.destination + '</td></tr>' +
    '</table>' +
    '<a class=cta href="https://aqualink-1.onrender.com">View Dashboard →</a>'
  );
  var customerBody = emailWrap(
    '<h2>💳 Payment Confirmed!</h2>' +
    '<p>Thank you <strong>' + userName + '</strong>! Your payment has been received and your booking is now active.</p>' +
    '<table>' +
    '<tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">' + booking.id + '</td></tr>' +
    '<tr><td>Amount Paid</td><td style="color:#06d6a0;font-weight:700">' + currency + ' ' + amount.toLocaleString() + '</td></tr>' +
    '<tr><td>Destination</td><td>' + booking.destination + '</td></tr>' +
    '<tr><td>Water Type</td><td>' + booking.waterType + '</td></tr>' +
    '<tr><td>Status</td><td>Active — being coordinated</td></tr>' +
    '</table>' +
    '<p>Our team will now coordinate your water delivery. You will be contacted within 24 hours.</p>' +
    '<a class=cta href="https://aqualink-1.onrender.com">Track Your Booking →</a>'
  );
  sendEmail(ADMIN_EMAIL, '💳 Payment Received — ' + booking.id + ' — ' + currency + ' ' + amount, adminBody);
  sendEmail(userEmail, '💳 Payment Confirmed — AquaLink Booking ' + booking.id, customerBody);
}

// ─── HELPERS ──────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}
function sendJSON(res, status, data) { setCORS(res); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function sendHTML(res, html) { setCORS(res); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, organization: u.organization, country: u.country, userType: u.userType, createdAt: u.createdAt }; }

// ─── THE FULL APP ─────────────────────────────────────
var HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AquaLink — Global Water Distribution Platform</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#010b14;--navy:#062040;--sky:#1578c8;--glow:#00e5ff;--ice:#c8f0ff;--gold:#ffd166;--coral:#ff6b6b;--green:#06d6a0;--muted:#4a7a9b;--foam:#38b6ff;--white:#f0faff}
body{font-family:'Outfit',sans-serif;background:var(--ink);color:var(--ice)}
/* ── LANDING PAGE ── */
#landing{display:block}
.land-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:rgba(1,11,20,0.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(0,229,255,0.08)}
.logo{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:3px;color:#fff;display:flex;align-items:center;gap:10px}
.logo-mark{width:30px;height:30px;background:linear-gradient(135deg,var(--sky),var(--glow));clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);animation:spin 8s linear infinite;box-shadow:0 0 20px rgba(0,229,255,0.3)}
@keyframes spin{to{transform:rotate(360deg)}}
.land-nav-links{display:flex;gap:28px;align-items:center}
.land-nav-links a{color:rgba(200,240,255,0.6);text-decoration:none;font-size:.88rem;font-weight:500;transition:color .2s}
.land-nav-links a:hover{color:var(--glow)}
.land-nav-btns{display:flex;gap:10px}
.btn-outline{padding:9px 22px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.3);color:var(--ice);background:transparent;font-family:'Outfit',sans-serif;font-weight:600;font-size:.85rem;cursor:pointer;transition:all .2s}
.btn-outline:hover{border-color:var(--glow);color:var(--glow)}
.btn-solid{padding:9px 22px;border-radius:100px;background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink);border:none;font-family:'Outfit',sans-serif;font-weight:700;font-size:.85rem;cursor:pointer;transition:all .2s}
.btn-solid:hover{transform:scale(1.05);box-shadow:0 6px 24px rgba(0,229,255,0.3)}
/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:120px 40px 80px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,rgba(21,120,200,0.12),transparent 70%)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:100px;padding:7px 18px;font-size:.75rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--glow);margin-bottom:28px;animation:fadeUp .8s ease both}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
.hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(4rem,10vw,9rem);line-height:.92;letter-spacing:4px;color:#fff;margin-bottom:16px;animation:fadeUp .8s ease .1s both}
.hero-title .stroke{-webkit-text-stroke:2px var(--glow);color:transparent}
.hero-title .filled{background:linear-gradient(180deg,#fff,var(--foam));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{font-size:1.1rem;color:rgba(200,240,255,0.65);max-width:560px;line-height:1.8;margin:0 auto 44px;font-weight:300;animation:fadeUp .8s ease .2s both}
.hero-btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;animation:fadeUp .8s ease .3s both}
.btn-hero-p{padding:16px 40px;border-radius:100px;background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink);border:none;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;transition:all .2s;box-shadow:0 8px 30px rgba(0,229,255,0.25)}
.btn-hero-p:hover{transform:translateY(-4px);box-shadow:0 16px 50px rgba(0,229,255,0.4)}
.btn-hero-g{padding:16px 40px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.3);color:var(--ice);background:transparent;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;transition:all .2s}
.btn-hero-g:hover{border-color:var(--glow);color:var(--glow);transform:translateY(-4px)}
@keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
/* STATS STRIP */
.stats-strip{background:rgba(6,32,64,0.7);border-top:1px solid rgba(0,229,255,0.08);border-bottom:1px solid rgba(0,229,255,0.08);padding:40px 60px;display:grid;grid-template-columns:repeat(4,1fr);backdrop-filter:blur(12px)}
.stat-item{text-align:center;position:relative}
.stat-item+.stat-item::before{content:'';position:absolute;left:0;top:20%;bottom:20%;width:1px;background:rgba(0,229,255,0.1)}
.stat-num{font-family:'Bebas Neue',sans-serif;font-size:3rem;letter-spacing:2px;background:linear-gradient(135deg,var(--foam),var(--glow));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1}
.stat-label{font-size:.72rem;text-transform:uppercase;letter-spacing:2px;color:var(--muted);margin-top:6px;font-weight:500}
.stat-note{font-size:.72rem;color:var(--coral);margin-top:4px;font-style:italic}
/* SECTIONS */
.section{padding:100px 60px;max-width:1200px;margin:0 auto}
.section-tag{font-size:.72rem;text-transform:uppercase;letter-spacing:3px;color:var(--glow);font-weight:700;margin-bottom:14px}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(2.5rem,5vw,4rem);letter-spacing:2px;color:#fff;line-height:1;margin-bottom:16px}
.section-title em{font-style:normal;-webkit-text-stroke:1.5px var(--glow);color:transparent}
.section-sub{color:var(--muted);font-size:1rem;line-height:1.8;max-width:500px;font-weight:300}
/* HOW IT WORKS */
.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:56px}
.step-card{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:20px;padding:32px;position:relative;transition:all .25s}
.step-card:hover{transform:translateY(-6px);border-color:rgba(0,229,255,0.25);box-shadow:0 20px 50px rgba(0,0,0,0.3)}
.step-num{font-family:'Bebas Neue',sans-serif;font-size:3rem;letter-spacing:2px;background:linear-gradient(135deg,var(--sky),var(--glow));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:12px}
.step-card h4{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px}
.step-card p{font-size:.88rem;color:var(--muted);line-height:1.7}
/* WHO IT'S FOR */
.who-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:56px}
.who-card{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:20px;padding:32px;text-align:center;transition:all .25s;cursor:pointer}
.who-card:hover{transform:translateY(-6px);border-color:rgba(0,229,255,0.3);box-shadow:0 20px 50px rgba(0,0,0,0.3)}
.who-icon{font-size:2.5rem;margin-bottom:16px}
.who-card h4{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px}
.who-card p{font-size:.85rem;color:var(--muted);line-height:1.7;margin-bottom:20px}
.who-btn{display:inline-block;padding:10px 24px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.25);color:var(--glow);font-size:.82rem;font-weight:600;cursor:pointer;transition:all .2s;background:transparent;font-family:'Outfit',sans-serif}
.who-btn:hover{background:rgba(0,229,255,0.08);border-color:var(--glow)}
/* SUPPLIERS SECTION */
.suppliers-section{background:rgba(6,32,64,0.3);border-top:1px solid rgba(0,229,255,0.08);border-bottom:1px solid rgba(0,229,255,0.08);padding:100px 60px}
.suppliers-inner{max-width:1200px;margin:0 auto}
.supplier-cta{background:linear-gradient(135deg,rgba(10,74,124,0.5),rgba(6,32,64,0.8));border:1px solid rgba(0,229,255,0.15);border-radius:24px;padding:48px;display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;margin-top:40px}
.supplier-cta h3{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:2px;color:#fff;margin-bottom:8px}
.supplier-cta p{color:var(--muted);font-size:.9rem;line-height:1.7;max-width:480px}
/* FOOTER */
.land-footer{background:rgba(2,12,24,0.9);border-top:1px solid rgba(0,229,255,0.07);padding:60px;text-align:center}
.land-footer p{color:var(--muted);font-size:.85rem;margin-top:12px}
/* ── APP ── */
#app{display:none}
.topbar{background:rgba(1,11,20,0.95);border-bottom:1px solid rgba(0,229,255,0.1);padding:14px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px);flex-wrap:wrap;gap:10px}
.topbar-logo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:3px;display:flex;align-items:center;gap:8px}
.nav{display:flex;gap:6px;flex-wrap:wrap}
.nb{padding:7px 14px;border-radius:100px;font-size:.8rem;font-weight:600;cursor:pointer;border:1.5px solid rgba(0,229,255,0.18);color:var(--muted);background:transparent;font-family:'Outfit',sans-serif;transition:all .2s}
.nb:hover,.nb.on{border-color:var(--glow);color:var(--glow);background:rgba(0,229,255,0.07)}
.user-area{display:flex;align-items:center;gap:8px}
.av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--sky),var(--glow));display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:.85rem;color:var(--ink)}
.uname{font-size:.82rem;font-weight:600}
.urole{font-size:.72rem;color:var(--muted);background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.15);border-radius:100px;padding:2px 8px}
.logout-btn{padding:6px 14px;border-radius:100px;border:1px solid rgba(255,107,107,0.3);color:var(--coral);background:transparent;font-size:.78rem;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s}
.logout-btn:hover{background:rgba(255,107,107,0.1)}
.page{display:none;padding:32px;max-width:1100px;margin:0 auto}
.page.on{display:block}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:2px;color:#fff;margin-bottom:6px}
.psub{color:var(--muted);font-size:.88rem;margin-bottom:24px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.card{background:rgba(6,32,64,0.7);border:1px solid rgba(0,229,255,0.12);border-radius:16px;padding:20px;transition:transform .2s}
.card:hover{transform:translateY(-3px)}
.clabel{font-size:.68rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;margin-bottom:8px}
.cval{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:1px;color:#fff;line-height:1}
.ctag{font-size:.72rem;color:var(--green);margin-top:6px}
.panel{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:16px;padding:24px;margin-bottom:20px}
.ptit{font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:16px}
.tscroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.87rem}
th{text-align:left;padding:10px 13px;font-size:.67rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;border-bottom:1px solid rgba(0,229,255,0.08)}
td{padding:12px 13px;color:var(--ice);border-bottom:1px solid rgba(0,229,255,0.04)}
tr:hover td{background:rgba(0,229,255,0.03)}
.bid{font-family:'Bebas Neue',sans-serif;font-size:.9rem;letter-spacing:1px;color:var(--glow)}
.badge{display:inline-block;padding:3px 9px;border-radius:100px;font-size:.68rem;font-weight:700}
.b-active{background:rgba(6,214,160,0.12);color:var(--green);border:1px solid rgba(6,214,160,0.2)}
.b-pending{background:rgba(255,209,102,0.1);color:var(--gold);border:1px solid rgba(255,209,102,0.2)}
.b-transit{background:rgba(0,229,255,0.1);color:var(--glow);border:1px solid rgba(0,229,255,0.2)}
.b-complete{background:rgba(74,122,155,0.15);color:var(--muted);border:1px solid rgba(74,122,155,0.2)}
.b-crit{background:rgba(255,107,107,0.12);color:var(--coral);border:1px solid rgba(255,107,107,0.2)}
.b-supplier{background:rgba(0,229,255,0.1);color:var(--foam);border:1px solid rgba(0,229,255,0.2)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.fg{display:flex;flex-direction:column;gap:6px}
.fg label{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600}
.fg input,.fg select,.fg textarea{padding:12px 15px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:.88rem;outline:none;transition:border-color .2s}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--glow)}
.fg select option{background:#021525}
.fg textarea{resize:vertical;min-height:72px}
.full{grid-column:1/-1}
.btn{padding:11px 24px;border-radius:100px;font-family:'Outfit',sans-serif;font-weight:700;font-size:.87rem;cursor:pointer;border:none;transition:all .2s}
.btn-p{background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,229,255,0.3)}
.btn-p:disabled{opacity:.5;transform:none}
.btn-g{background:transparent;border:1.5px solid rgba(0,229,255,0.25);color:var(--ice)}
.btn-g:hover{border-color:var(--glow);color:var(--glow)}
.btn-d{background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.25);color:var(--coral)}
.btn-d:hover{background:rgba(255,107,107,0.2)}
.btn-row{display:flex;gap:12px;margin-top:18px;flex-wrap:wrap}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{padding:7px 15px;border-radius:100px;font-size:.79rem;font-weight:600;border:1.5px solid rgba(0,229,255,0.18);color:var(--muted);background:transparent;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s}
.pill.on,.pill:hover{border-color:var(--glow);color:var(--glow);background:rgba(0,229,255,0.08)}
.vol-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.vol-lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600}
.vol-val{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:1px;color:var(--glow)}
input[type=range]{width:100%;height:5px;-webkit-appearance:none;background:rgba(0,229,255,0.12);border-radius:100px;outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,var(--sky),var(--glow));cursor:pointer}
.ssel{padding:5px 10px;background:rgba(1,11,20,0.8);border:1px solid rgba(0,229,255,0.15);border-radius:8px;color:#fff;font-size:.78rem;cursor:pointer;outline:none}
.ssel option{background:#021525}
.frow{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.frow input,.frow select{padding:9px 13px;background:rgba(1,11,20,0.7);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-size:.83rem;outline:none;font-family:'Outfit',sans-serif}
.frow select option{background:#021525}
.empty{text-align:center;padding:40px;color:var(--muted)}
.success-wrap{text-align:center;padding:40px 20px}
.success-wrap .big{font-size:3.5rem;margin-bottom:14px}
.success-wrap h3{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;color:var(--green);letter-spacing:2px;margin-bottom:8px}
.success-wrap p{color:var(--muted);font-size:.88rem;line-height:1.7}
.id-chip{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;letter-spacing:2px;color:var(--glow);background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:10px 18px;margin:14px 0;display:inline-block}
.bar-item{margin-bottom:13px}
.bar-head{display:flex;justify-content:space-between;font-size:.79rem;margin-bottom:5px}
.bar-track{height:5px;background:rgba(0,229,255,0.08);border-radius:100px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--sky),var(--glow));border-radius:100px}
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;background:rgba(6,32,64,0.97);border:1px solid rgba(0,229,255,0.3);border-radius:14px;padding:13px 18px;display:flex;align-items:center;gap:10px;transform:translateY(70px);opacity:0;transition:all .4s;backdrop-filter:blur(14px);font-size:.87rem;color:var(--ice);max-width:320px}
.toast.show{transform:translateY(0);opacity:1}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(1,11,20,0.3);border-top-color:var(--ink);border-radius:50%;animation:rot .6s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes rot{to{transform:rotate(360deg)}}
/* AUTH MODAL */
.overlay{position:fixed;inset:0;background:rgba(1,11,20,0.9);backdrop-filter:blur(14px);z-index:500;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .3s}
.overlay.open{opacity:1;pointer-events:all}
.mbox{background:linear-gradient(135deg,rgba(6,32,64,0.97),rgba(2,21,37,0.99));border:1px solid rgba(0,229,255,0.2);border-radius:24px;padding:40px;width:90%;max-width:480px;transform:scale(.95) translateY(16px);transition:transform .3s;position:relative;box-shadow:0 40px 80px rgba(0,0,0,0.6);max-height:90vh;overflow-y:auto}
.overlay.open .mbox{transform:scale(1) translateY(0)}
.mclose{position:absolute;top:16px;right:20px;background:none;border:none;color:var(--muted);font-size:1.4rem;cursor:pointer;transition:color .2s}
.mclose:hover{color:#fff}
.mtabs{display:flex;background:rgba(1,11,20,0.5);border-radius:12px;padding:4px;margin-bottom:24px}
.mtab{flex:1;padding:9px;text-align:center;border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;color:var(--muted);transition:all .2s}
.mtab.on{background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink)}
.mfield{margin-bottom:14px}
.mfield label{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;margin-bottom:7px}
.minp{width:100%;padding:12px 15px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.2);border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:.9rem;outline:none;transition:border-color .2s}
.minp:focus{border-color:var(--glow)}
.minp option{background:#021525}
.m2col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mmain-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--sky),var(--glow));border:none;border-radius:14px;color:var(--ink);font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;margin-top:6px;transition:all .2s}
.mmain-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,229,255,0.35)}
.mmain-btn:disabled{opacity:.5;transform:none}
.merr{background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);border-radius:10px;padding:10px 14px;color:var(--coral);font-size:.82rem;margin-bottom:12px;display:none}
.mok{background:rgba(6,214,160,0.1);border:1px solid rgba(6,214,160,0.2);border-radius:10px;padding:10px 14px;color:var(--green);font-size:.82rem;margin-bottom:12px;display:none}
.mhint{text-align:center;font-size:.75rem;color:var(--muted);margin-top:12px}
/* TYPE SELECTOR */
.type-selector{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.type-card{padding:20px;border:1.5px solid rgba(0,229,255,0.15);border-radius:16px;cursor:pointer;text-align:center;transition:all .2s}
.type-card:hover,.type-card.selected{border-color:var(--glow);background:rgba(0,229,255,0.07)}
.type-card .ticon{font-size:2rem;margin-bottom:8px}
.type-card h5{font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:1.5px;color:#fff;margin-bottom:4px}
.type-card p{font-size:.75rem;color:var(--muted);line-height:1.5}
/* GROWTH SECTION */
.growth-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px}
.growth-card{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:16px;padding:24px}
.growth-card h4{font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:1.5px;color:#fff;margin-bottom:16px}
/* INFO BANNER */
.info-banner{background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.2);border-radius:12px;padding:14px 18px;color:var(--gold);font-size:.83rem;margin-bottom:20px;line-height:1.6}
.info-banner strong{color:#ffe082}
@media(max-width:768px){
  .land-nav{padding:14px 20px}.land-nav-links{display:none}
  .stats-strip{grid-template-columns:1fr 1fr;gap:24px;padding:40px 24px}
  .steps-grid,.who-grid{grid-template-columns:1fr}
  .section{padding:60px 24px}.suppliers-section{padding:60px 24px}
  .cards{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}
  .m2col{grid-template-columns:1fr}.type-selector{grid-template-columns:1fr}
  .page{padding:16px}.growth-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- ══════════════════════════════════════════
     LANDING PAGE
══════════════════════════════════════════ -->
<div id="landing">

  <!-- NAV -->
  <nav class="land-nav">
    <div class="logo"><div class="logo-mark"></div>AQUALINK</div>
    <div class="land-nav-links">
      <a href="#how-it-works">How It Works</a>
      <a href="#who">Who It's For</a>
      <a href="#suppliers">Become a Supplier</a>
      <a href="#about">About Us</a>
      <a href="#contact">Contact</a>
    </div>
    <div class="land-nav-btns">
      <button class="btn-outline" onclick="openAuth('login')">Login</button>
      <button class="btn-solid" onclick="openAuth('register')">Get Started</button>
    </div>
  </nav>

  <!-- HERO -->
  <div class="hero">
    <div class="hero-badge"><span class="live-dot"></span>Platform Live — Join Today</div>
    <h1 class="hero-title">
      <div class="filled">WATER</div>
      <div class="stroke">FOR ALL</div>
    </h1>
    <p class="hero-sub">AquaLink connects water suppliers, NGOs, governments, and communities — making clean water accessible anywhere in the world through smart booking and distribution technology.</p>
    <div class="hero-btns">
      <button class="btn-hero-p" onclick="openAuth('register','consumer')">Book Water Now</button>
      <button class="btn-hero-g" onclick="openAuth('register','supplier')">Become a Supplier</button>
    </div>
  </div>

  <!-- STATS STRIP -->
  <div class="stats-strip">
    <div class="stat-item">
      <div class="stat-num" id="land-bookings">0</div>
      <div class="stat-label">Bookings Made</div>
      <div class="stat-note">Growing daily</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="land-users">0</div>
      <div class="stat-label">Registered Users</div>
      <div class="stat-note">Join them today</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="land-litres">0</div>
      <div class="stat-label">Litres Requested</div>
      <div class="stat-note">Real platform data</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="land-suppliers">0</div>
      <div class="stat-label">Verified Suppliers</div>
      <div class="stat-note">Apply to join</div>
    </div>
  </div>

  <!-- HOW IT WORKS -->
  <div class="section" id="how-it-works">
    <div class="section-tag">Simple Process</div>
    <h2 class="section-title">HOW<br>AQUALINK <em>WORKS</em></h2>
    <p class="section-sub">Three simple steps to get clean water delivered anywhere in the world.</p>
    <div class="steps-grid">
      <div class="step-card">
        <div class="step-num">01</div>
        <h4>REGISTER YOUR ACCOUNT</h4>
        <p>Sign up as a Consumer (individual, NGO, government) or as a Water Supplier. Verification takes under 24 hours.</p>
      </div>
      <div class="step-card">
        <div class="step-num">02</div>
        <h4>SUBMIT A BOOKING</h4>
        <p>Tell us your location, how much water you need, what type, and your urgency level. We match you to the nearest verified supplier instantly.</p>
      </div>
      <div class="step-card">
        <div class="step-num">03</div>
        <h4>RECEIVE YOUR WATER</h4>
        <p>Our admin team coordinates with your matched supplier and keeps you updated every step of the way until delivery is confirmed.</p>
      </div>
    </div>
  </div>

  <!-- WHO IT'S FOR -->
  <div class="section" id="who" style="padding-top:0">
    <div class="section-tag">For Everyone</div>
    <h2 class="section-title">WHO CAN<br>USE <em>AQUALINK</em></h2>
    <p class="section-sub">Whether you need water or supply it — AquaLink is built for you.</p>
    <div class="who-grid">
      <div class="who-card">
        <div class="who-icon">🏛️</div>
        <h4>GOVERNMENTS</h4>
        <p>Manage national water distribution, respond to crises, and coordinate emergency relief at scale with full tracking and reporting.</p>
        <button class="who-btn" onclick="openAuth('register','consumer')">Register as Government →</button>
      </div>
      <div class="who-card">
        <div class="who-icon">🌍</div>
        <h4>NGOs & AID ORGS</h4>
        <p>Book emergency water supplies for affected communities with priority processing and subsidized rates for verified humanitarian organizations.</p>
        <button class="who-btn" onclick="openAuth('register','consumer')">Register as NGO →</button>
      </div>
      <div class="who-card">
        <div class="who-icon">👥</div>
        <h4>COMMUNITIES</h4>
        <p>Individual families and communities can book potable water for drinking, sanitation, or agricultural use — delivered to your location.</p>
        <button class="who-btn" onclick="openAuth('register','consumer')">Register as Community →</button>
      </div>
    </div>
  </div>

  <!-- SUPPLIERS -->
  <div class="suppliers-section" id="suppliers">
    <div class="suppliers-inner">
      <div class="section-tag">Water Suppliers</div>
      <h2 class="section-title">ARE YOU A<br>WATER <em>SUPPLIER?</em></h2>
      <p class="section-sub">Join AquaLink's verified supplier network and connect your water supply to millions of people who need it globally.</p>
      <div class="supplier-cta">
        <div>
          <h3>JOIN AS A VERIFIED SUPPLIER</h3>
          <p>Water companies, tanker operators, treatment plants, and distributors — list your capacity on AquaLink and receive booking requests from NGOs, governments, and communities in your region. We handle the coordination, you handle the delivery.</p>
          <div style="margin-top:16px;display:flex;gap:24px;flex-wrap:wrap">
            <div style="font-size:.85rem;color:var(--green)">✅ Free to list</div>
            <div style="font-size:.85rem;color:var(--green)">✅ Receive booking requests</div>
            <div style="font-size:.85rem;color:var(--green)">✅ Expand your customer base</div>
            <div style="font-size:.85rem;color:var(--green)">✅ Verified supplier badge</div>
          </div>
        </div>
        <button class="btn-hero-p" style="flex-shrink:0" onclick="openAuth('register','supplier')">APPLY AS SUPPLIER →</button>
      </div>
    </div>
  </div>

  <!-- ABOUT SECTION -->
  <div class="section" id="about" style="background:rgba(6,32,64,0.2);border-top:1px solid rgba(0,229,255,0.08);padding:100px 60px">
    <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center">
      <div>
        <div class="section-tag">About AquaLink</div>
        <h2 class="section-title">WE BELIEVE<br>WATER IS A<br><em>HUMAN RIGHT</em></h2>
        <p class="section-sub" style="margin-bottom:20px">AquaLink was founded on one simple belief — no person on Earth should die from lack of access to clean water. We are building the technology infrastructure to make that a reality.</p>
        <p class="section-sub" style="margin-bottom:20px">We connect water suppliers, NGOs, governments, and communities through a single intelligent platform — making water distribution faster, more transparent, and more accountable than ever before.</p>
        <p class="section-sub">Every booking made on AquaLink is tracked, every payment is verified, and every delivery is confirmed. Full transparency from source to destination.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.12);border-radius:20px;padding:28px;text-align:center">
          <div style="font-family:Bebas Neue,sans-serif;font-size:2.5rem;background:linear-gradient(135deg,#38b6ff,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">100%</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:6px">Transparent Transactions</div>
        </div>
        <div style="background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.12);border-radius:20px;padding:28px;text-align:center">
          <div style="font-family:Bebas Neue,sans-serif;font-size:2.5rem;background:linear-gradient(135deg,#38b6ff,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">24/7</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:6px">Platform Available</div>
        </div>
        <div style="background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.12);border-radius:20px;padding:28px;text-align:center">
          <div style="font-family:Bebas Neue,sans-serif;font-size:2.5rem;background:linear-gradient(135deg,#38b6ff,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">48H</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:6px">Emergency Response</div>
        </div>
        <div style="background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.12);border-radius:20px;padding:28px;text-align:center">
          <div style="font-family:Bebas Neue,sans-serif;font-size:2.5rem;background:linear-gradient(135deg,#38b6ff,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">🌍</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:6px">Global Coverage</div>
        </div>
      </div>
    </div>
  </div>

  <!-- CONTACT SECTION -->
  <div class="section" id="contact" style="padding:100px 60px">
    <div style="max-width:900px;margin:0 auto">
      <div class="section-tag">Get In Touch</div>
      <h2 class="section-title">CONTACT <em>US</em></h2>
      <p class="section-sub" style="margin-bottom:48px">Have questions about AquaLink? Want to partner with us? We respond to every message within 24 hours.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start">
        <div>
          <div style="display:flex;flex-direction:column;gap:24px">
            <div style="display:flex;gap:16px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">📧</div>
              <div>
                <div style="font-weight:600;color:var(--ice);margin-bottom:4px">Email Us</div>
                <div style="color:var(--muted);font-size:.88rem">aqualink79@gmail.com</div>
                <div style="color:var(--muted);font-size:.82rem;margin-top:2px">We reply within 24 hours</div>
              </div>
            </div>
            <div style="display:flex;gap:16px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">🌍</div>
              <div>
                <div style="font-weight:600;color:var(--ice);margin-bottom:4px">Headquarters</div>
                <div style="color:var(--muted);font-size:.88rem">Nigeria, West Africa</div>
                <div style="color:var(--muted);font-size:.82rem;margin-top:2px">Serving globally</div>
              </div>
            </div>
            <div style="display:flex;gap:16px;align-items:flex-start">
              <div style="width:44px;height:44px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">🤝</div>
              <div>
                <div style="font-weight:600;color:var(--ice);margin-bottom:4px">Partnerships</div>
                <div style="color:var(--muted);font-size:.88rem">Open to NGOs, governments</div>
                <div style="color:var(--muted);font-size:.82rem;margin-top:2px">and water suppliers</div>
              </div>
            </div>
          </div>
        </div>
        <div style="background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.15);border-radius:20px;padding:32px">
          <h3 style="font-family:Bebas Neue,sans-serif;font-size:1.4rem;letter-spacing:2px;color:#fff;margin-bottom:20px">SEND US A MESSAGE</h3>
          <div style="margin-bottom:14px">
            <input id="c-name" type="text" placeholder="Your Name" style="width:100%;padding:12px 16px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:.9rem;outline:none">
          </div>
          <div style="margin-bottom:14px">
            <input id="c-email" type="email" placeholder="Your Email" style="width:100%;padding:12px 16px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:.9rem;outline:none">
          </div>
          <div style="margin-bottom:14px">
            <select id="c-subject" style="width:100%;padding:12px 16px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:.9rem;outline:none;-webkit-appearance:none">
              <option>I want to book water</option>
              <option>I want to become a supplier</option>
              <option>Partnership inquiry</option>
              <option>Technical support</option>
              <option>General question</option>
            </select>
          </div>
          <div style="margin-bottom:18px">
            <textarea id="c-msg" placeholder="Your message..." rows="4" style="width:100%;padding:12px 16px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:Outfit,sans-serif;font-size:.9rem;outline:none;resize:vertical"></textarea>
          </div>
          <div id="c-result" style="margin-bottom:12px;font-size:.83rem;display:none"></div>
          <button onclick="sendContact()" style="width:100%;padding:13px;background:linear-gradient(135deg,#1578c8,#00e5ff);border:none;border-radius:14px;color:#010b14;font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer">SEND MESSAGE →</button>
        </div>
      </div>
    </div>
  </div>

  <!-- LEGAL PAGES (hidden, shown via modal) -->

  <!-- PRIVACY POLICY -->
  <div id="privacy-modal" style="display:none;position:fixed;inset:0;background:rgba(1,11,20,0.95);z-index:999;overflow-y:auto;padding:40px 20px">
    <div style="max-width:800px;margin:0 auto;background:rgba(6,32,64,0.9);border:1px solid rgba(0,229,255,0.2);border-radius:24px;padding:48px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px">
        <h2 style="font-family:Bebas Neue,sans-serif;font-size:2rem;letter-spacing:2px;color:#fff">PRIVACY POLICY</h2>
        <button onclick="closeModal('privacy-modal')" style="background:none;border:none;color:var(--muted);font-size:1.5rem;cursor:pointer">✕</button>
      </div>
      <p style="color:var(--muted);font-size:.82rem;margin-bottom:24px">Last updated: May 2026</p>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">1. Information We Collect</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">We collect information you provide when registering on AquaLink, including your name, email address, organization name, country, and payment details. We also collect information about your bookings and interactions with our platform.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">2. How We Use Your Information</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">We use your information to process water bookings and payments, send you booking confirmations and updates, notify you of important platform changes, match you with water suppliers in your region, and improve our services.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">3. Payment Information</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">Payments are processed securely through Paystack. AquaLink does not store your full card details. All payment data is encrypted and handled according to PCI DSS standards.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">4. Data Sharing</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">We do not sell your personal data. We share your information only with water suppliers assigned to fulfill your booking, payment processors, and when required by law.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">5. Data Security</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">We implement industry-standard security measures including encrypted data transmission, secure password hashing, and regular security reviews to protect your information.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">6. Your Rights</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">You have the right to access, correct, or delete your personal data at any time. Contact us at aqualink79@gmail.com to exercise these rights.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">7. Contact Us</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">For privacy-related questions, contact us at aqualink79@gmail.com. We will respond within 48 hours.</p>
    </div>
    </div>
  </div>

  <!-- TERMS OF SERVICE -->
  <div id="terms-modal" style="display:none;position:fixed;inset:0;background:rgba(1,11,20,0.95);z-index:999;overflow-y:auto;padding:40px 20px">
    <div style="max-width:800px;margin:0 auto;background:rgba(6,32,64,0.9);border:1px solid rgba(0,229,255,0.2);border-radius:24px;padding:48px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px">
        <h2 style="font-family:Bebas Neue,sans-serif;font-size:2rem;letter-spacing:2px;color:#fff">TERMS OF SERVICE</h2>
        <button onclick="closeModal('terms-modal')" style="background:none;border:none;color:var(--muted);font-size:1.5rem;cursor:pointer">✕</button>
      </div>
      <p style="color:var(--muted);font-size:.82rem;margin-bottom:24px">Last updated: May 2026</p>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">1. Acceptance of Terms</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">By using AquaLink, you agree to these Terms of Service. If you do not agree, please do not use our platform.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">2. Platform Description</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">AquaLink is a water distribution coordination platform that connects consumers with water suppliers. We facilitate bookings and payments but are not directly responsible for water delivery — that is the responsibility of the assigned supplier.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">3. User Responsibilities</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">You must provide accurate information when registering and booking. You are responsible for ensuring the delivery location is accessible. You must pay for bookings in full before delivery is dispatched.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">4. Supplier Responsibilities</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">Verified suppliers must deliver water as specified in the booking. Suppliers must maintain the quality standards agreed upon registration. Failure to deliver may result in removal from the platform.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">5. Payments</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">All payments are processed securely through Paystack. AquaLink charges a platform fee on each transaction. Suppliers receive payment within 48 hours of confirmed delivery.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">6. Cancellations</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">Bookings may be cancelled before a supplier is assigned at no charge. Cancellations after supplier assignment may incur a fee. Emergency bookings cannot be cancelled once dispatched.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">7. Limitation of Liability</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">AquaLink is not liable for delays caused by factors outside our control including weather, road conditions, or supplier issues. Our maximum liability is limited to the amount paid for the affected booking.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">8. Contact</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">For questions about these terms, contact aqualink79@gmail.com</p>
    </div>
    </div>
  </div>

  <!-- REFUND POLICY -->
  <div id="refund-modal" style="display:none;position:fixed;inset:0;background:rgba(1,11,20,0.95);z-index:999;overflow-y:auto;padding:40px 20px">
    <div style="max-width:800px;margin:0 auto;background:rgba(6,32,64,0.9);border:1px solid rgba(0,229,255,0.2);border-radius:24px;padding:48px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px">
        <h2 style="font-family:Bebas Neue,sans-serif;font-size:2rem;letter-spacing:2px;color:#fff">REFUND POLICY</h2>
        <button onclick="closeModal('refund-modal')" style="background:none;border:none;color:var(--muted);font-size:1.5rem;cursor:pointer">✕</button>
      </div>
      <p style="color:var(--muted);font-size:.82rem;margin-bottom:24px">Last updated: May 2026</p>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">Full Refund</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">You are entitled to a full refund if: Your booking is cancelled before a supplier is assigned, AquaLink cannot find a supplier for your location, or delivery is not completed within 48 hours of the agreed delivery date for emergency orders.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">Partial Refund</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">A partial refund may be issued if the volume of water delivered is less than booked, or if water quality does not meet the agreed standard.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">No Refund</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">No refund will be issued if delivery was completed as specified, the customer was unavailable to receive delivery, or incorrect delivery information was provided.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">How to Request a Refund</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">Email aqualink79@gmail.com with your Booking ID and reason for refund request. Refunds are processed within 5-7 business days back to your original payment method.</p>
    </div>
      <div style="margin-bottom:24px">
      <h4 style="font-family:Bebas Neue,sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px">Contact</h4>
      <p style="color:var(--muted);font-size:.88rem;line-height:1.8">For refund questions, contact aqualink79@gmail.com. We aim to resolve all refund requests within 48 hours.</p>
    </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="land-footer">
    <div class="logo" style="justify-content:center"><div class="logo-mark"></div>AQUALINK</div>
    <p>A global platform connecting water supply to human need.</p>
    <p style="margin-top:8px">© 2026 AquaLink Global. Built to make clean water accessible for all.</p>
    <div style="margin-top:20px;display:flex;gap:20px;justify-content:center;flex-wrap:wrap">
      <a href="#how-it-works" style="color:var(--muted);text-decoration:none;font-size:.82rem">How It Works</a>
      <a href="#about" style="color:var(--muted);text-decoration:none;font-size:.82rem">About Us</a>
      <a href="#contact" style="color:var(--muted);text-decoration:none;font-size:.82rem">Contact</a>
      <a href="#" onclick="openModal('privacy-modal')" style="color:var(--muted);text-decoration:none;font-size:.82rem">Privacy Policy</a>
      <a href="#" onclick="openModal('terms-modal')" style="color:var(--muted);text-decoration:none;font-size:.82rem">Terms of Service</a>
      <a href="#" onclick="openModal('refund-modal')" style="color:var(--muted);text-decoration:none;font-size:.82rem">Refund Policy</a>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════
     AUTH MODAL
══════════════════════════════════════════ -->
<div class="overlay" id="auth-overlay" onclick="closeOverlayOutside(event)">
  <div class="mbox">
    <button class="mclose" onclick="closeAuth()">✕</button>
    <div class="mtabs">
      <div class="mtab on" onclick="switchAuthTab('login',this)">Login</div>
      <div class="mtab" onclick="switchAuthTab('register',this)">Register</div>
    </div>
    <div id="merr" class="merr"></div>
    <div id="mok" class="mok"></div>

    <!-- LOGIN -->
    <div id="auth-login">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:2px;color:#fff;margin-bottom:4px">WELCOME BACK</div>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:20px">Sign in to your AquaLink account</p>
      <div class="mfield"><label>Email Address</label><input class="minp" id="l-email" type="email" placeholder="your@email.com"></div>
      <div class="mfield"><label>Password</label><input class="minp" id="l-pass" type="password" placeholder="Your password" onkeydown="if(event.key==='Enter')doLogin()"></div>
      <button class="mmain-btn" id="l-btn" onclick="doLogin()">LOGIN →</button>
      <p class="mhint">Demo: admin@aqualink.org / admin123</p>
    </div>

    <!-- REGISTER -->
    <div id="auth-register" style="display:none">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:2px;color:#fff;margin-bottom:4px">JOIN AQUALINK</div>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:20px">Create your free account</p>

      <!-- TYPE SELECTOR -->
      <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;margin-bottom:10px">I want to...</div>
      <div class="type-selector" id="type-selector">
        <div class="type-card selected" id="type-consumer" onclick="selectType('consumer')">
          <div class="ticon">💧</div>
          <h5>BOOK WATER</h5>
          <p>I need water for my community, organization, or government</p>
        </div>
        <div class="type-card" id="type-supplier" onclick="selectType('supplier')">
          <div class="ticon">🚚</div>
          <h5>SUPPLY WATER</h5>
          <p>I am a water company or supplier wanting to list my services</p>
        </div>
      </div>

      <div class="m2col">
        <div class="mfield"><label>Full Name *</label><input class="minp" id="r-name" type="text" placeholder="Your full name"></div>
        <div class="mfield"><label>Email *</label><input class="minp" id="r-email" type="email" placeholder="your@email.com"></div>
      </div>
      <div class="m2col">
        <div class="mfield"><label>Password *</label><input class="minp" id="r-pass" type="password" placeholder="Min 6 characters"></div>
        <div class="mfield"><label>Country *</label><input class="minp" id="r-country" type="text" placeholder="Your country"></div>
      </div>
      <div class="mfield"><label>Organization / Company Name</label><input class="minp" id="r-org" type="text" placeholder="Organization or company name"></div>
      <div id="r-supplier-extra" style="display:none">
        <div class="mfield"><label>Water Types You Supply</label>
          <select class="minp" id="r-water-types">
            <option>Potable / Drinking Water</option>
            <option>Agricultural Water</option>
            <option>Industrial Water</option>
            <option>All Types</option>
          </select>
        </div>
        <div class="mfield"><label>Supply Capacity (Litres per day)</label><input class="minp" id="r-capacity" type="number" placeholder="e.g. 100000"></div>
        <div class="mfield"><label>Regions You Cover</label><input class="minp" id="r-regions" type="text" placeholder="e.g. Lagos, Abuja, South West Nigeria"></div>
      </div>
      <div class="mfield"><label>Role / Organization Type</label>
        <select class="minp" id="r-role">
          <option value="user">Individual / Community</option>
          <option value="ngo">NGO / Humanitarian</option>
          <option value="gov">Government / Ministry</option>
          <option value="supplier">Water Supplier / Company</option>
        </select>
      </div>
      <button class="mmain-btn" id="r-btn" onclick="doRegister()">CREATE ACCOUNT →</button>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════
     MAIN APP
══════════════════════════════════════════ -->
<div id="app">
  <div class="topbar">
    <div class="topbar-logo"><div class="logo-mark" style="width:22px;height:22px"></div>AQUALINK</div>
    <div class="nav">
      <button class="nb on" onclick="goPage('dashboard',this)">Dashboard</button>
      <button class="nb" onclick="goPage('book',this)" id="book-btn">Book Water</button>
      <button class="nb" onclick="goPage('bookings',this)">My Bookings</button>
      <button class="nb" onclick="goPage('suppliers-pg',this)">Suppliers</button>
      <button class="nb" onclick="goPage('growth',this)" id="growth-btn" style="display:none">Growth</button>
      <button class="nb" onclick="goPage('users',this)" id="users-btn" style="display:none">Users</button>
    </div>
    <div class="user-area">
      <div class="av" id="av">A</div>
      <span class="uname" id="uname"></span>
      <span class="urole" id="urole"></span>
      <button class="logout-btn" onclick="doLogout()">Logout</button>
    </div>
  </div>

  <!-- DASHBOARD -->
  <div class="page on" id="pg-dashboard">
    <div class="ptitle" id="dash-title">Dashboard</div>
    <p class="psub" id="dash-sub">Your live AquaLink overview.</p>
    <div id="supplier-banner" class="info-banner" style="display:none">
      🚚 <strong>You are registered as a Water Supplier.</strong> When consumers book water in your region, the AquaLink admin team will contact you to coordinate delivery. Make sure your contact details are up to date.
    </div>
    <div class="cards">
      <div class="card"><div class="clabel" id="c1-label">Total Bookings</div><div class="cval" id="s-total">-</div><div class="ctag" id="c1-tag">All time</div></div>
      <div class="card"><div class="clabel" id="c2-label">Total Users</div><div class="cval" id="s-users">-</div><div class="ctag">Registered</div></div>
      <div class="card"><div class="clabel">Litres Requested</div><div class="cval" id="s-litres">-</div><div class="ctag">Total volume</div></div>
      <div class="card"><div class="clabel" id="c4-label">Pending Orders</div><div class="cval" id="s-pending">-</div><div class="ctag" id="c4-tag">Needs attention</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:20px">
      <div class="panel"><div class="ptit">Recent Bookings</div><div class="tscroll"><table><thead><tr><th>ID</th><th>Destination</th><th>Volume</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody id="recent-rows"></tbody></table></div></div>
      <div class="panel"><div class="ptit">By Status</div><div id="status-bars"></div></div>
    </div>
  </div>

  <!-- BOOK WATER -->
  <div class="page" id="pg-book">
    <div class="ptitle">Book Water Supply</div>
    <p class="psub">Request clean water delivery to your location.</p>
    <div id="book-success" class="success-wrap" style="display:none">
      <div class="big">💧</div><h3>BOOKING CONFIRMED!</h3>
      <div class="id-chip" id="s-id">AQL-XXXXX</div>
      <p id="s-msg"></p>
      <p style="margin-top:12px;font-size:.82rem;color:var(--muted)">Our team will contact you within 24 hours to coordinate delivery with a verified supplier in your region.</p>
      <button class="btn btn-p" style="margin-top:22px" onclick="goPage('bookings',document.querySelectorAll('.nb')[2])">VIEW MY BOOKINGS →</button>
    </div>
    <div class="panel" id="book-form">
      <div class="form-grid">
        <div class="fg"><label>Destination Country *</label><select id="b-country"><option value="">Select country...</option><option>Nigeria</option><option>Kenya</option><option>Ethiopia</option><option>Somalia</option><option>South Africa</option><option>Ghana</option><option>Egypt</option><option>Sudan</option><option>Niger</option><option>Mali</option><option>Chad</option><option>DR Congo</option><option>India</option><option>Bangladesh</option><option>Pakistan</option><option>Afghanistan</option><option>Yemen</option><option>Syria</option><option>Brazil</option><option>Colombia</option><option>Haiti</option><option>Venezuela</option><option>Indonesia</option><option>Philippines</option><option>Myanmar</option><option>Mexico</option></select></div>
        <div class="fg"><label>City / Region</label><input type="text" id="b-city" placeholder="e.g. Lagos, Kano, Maiduguri"></div>
        <div class="fg full"><label>Water Type</label><div class="pills"><button class="pill on" onclick="pickPill(this)">Potable</button><button class="pill" onclick="pickPill(this)">Agricultural</button><button class="pill" onclick="pickPill(this)">Industrial</button><button class="pill" onclick="pickPill(this)">Emergency</button></div></div>
        <div class="fg full"><div class="vol-row"><span class="vol-lbl">Volume Required</span><span class="vol-val" id="vol-disp">5,000 L</span></div><input type="range" id="vol-slide" min="100" max="500000" step="100" value="5000" oninput="updVol(this.value)"></div>
        <div class="fg"><label>Requestor Type</label><select id="b-rtype"><option>Government / Ministry</option><option>NGO / Humanitarian</option><option>Community Leader</option><option>Industrial / Commercial</option><option>Individual / Family</option></select></div>
        <div class="fg"><label>Priority Level</label><select id="b-pri"><option value="Standard">Standard - 7 to 14 days</option><option value="Urgent">Urgent - 2 to 4 days</option><option value="Emergency">Emergency - 24 to 48 hours</option></select></div>
        <div class="fg"><label>Required By Date</label><input type="date" id="b-date"></div>
        <div class="fg"><label>Additional Notes</label><input type="text" id="b-notes" placeholder="Special instructions..."></div>
      </div>
      <div id="b-err" style="background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);border-radius:10px;padding:10px 14px;color:var(--coral);font-size:.83rem;margin-top:14px;display:none"></div>
      <div class="btn-row"><button class="btn btn-p" id="b-btn" onclick="submitBook()">CONFIRM BOOKING →</button><button class="btn btn-g" onclick="resetBook()">Clear</button></div>
    </div>
  </div>

  <!-- MY BOOKINGS -->
  <div class="page" id="pg-bookings">
    <div class="ptitle">My Bookings</div>
    <p class="psub">Track and manage all your water booking requests.</p>
    <div class="frow"><input type="text" id="f-search" placeholder="Search..." oninput="loadBookings()" style="flex:1;min-width:150px"><select id="f-status" onchange="loadBookings()"><option value="all">All Statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="transit">In Transit</option><option value="complete">Complete</option></select><button class="btn btn-g" style="padding:9px 16px;font-size:.8rem" onclick="loadBookings()">↻ Refresh</button></div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table><thead><tr><th>ID</th><th>Destination</th><th>Type</th><th>Volume</th><th>Priority</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody id="bk-rows"></tbody></table></div><div id="bk-empty" class="empty" style="display:none"><div style="font-size:2.5rem;margin-bottom:10px">💧</div><span id="bk-msg">No bookings yet.</span></div></div>
  </div>

  <!-- SUPPLIERS PAGE -->
  <div class="page" id="pg-suppliers-pg">
    <div class="ptitle">Water Suppliers</div>
    <p class="psub">Verified water suppliers registered on AquaLink.</p>
    <div class="info-banner">ℹ️ <strong>How suppliers work:</strong> Suppliers listed here are registered companies and individuals who provide water in their regions. When you make a booking, our admin team matches you with the nearest available supplier and coordinates the delivery.</div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table><thead><tr><th>Supplier Name</th><th>Organization</th><th>Country</th><th>Water Types</th><th>Coverage</th><th>Status</th></tr></thead><tbody id="supplier-rows"></tbody></table></div><div id="supplier-empty" class="empty" style="display:none"><div style="font-size:2.5rem;margin-bottom:10px">🚚</div><p>No verified suppliers yet.</p><p style="margin-top:8px;font-size:.83rem"><a href="#" onclick="openAuth('register','supplier')" style="color:var(--glow)">Apply to become our first supplier →</a></p></div></div>
  </div>

  <!-- GROWTH PAGE (admin only) -->
  <div class="page" id="pg-growth">
    <div class="ptitle">Growth Tracking</div>
    <p class="psub">Real platform metrics — how AquaLink is growing.</p>
    <div class="growth-grid">
      <div class="growth-card"><h4>TOTAL BOOKINGS</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--glow)" id="g-bookings">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">All time</div></div>
      <div class="growth-card"><h4>TOTAL USERS</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--glow)" id="g-users">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">Registered accounts</div></div>
      <div class="growth-card"><h4>TOTAL SUPPLIERS</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--glow)" id="g-suppliers">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">Verified suppliers</div></div>
      <div class="growth-card"><h4>LITRES REQUESTED</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--glow)" id="g-litres">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">Total volume</div></div>
      <div class="growth-card"><h4>EMERGENCY ORDERS</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--coral)" id="g-emergency">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">High priority bookings</div></div>
      <div class="growth-card"><h4>COMPLETED ORDERS</h4><div style="font-family:'Bebas Neue',sans-serif;font-size:3rem;color:var(--green)" id="g-complete">-</div><div style="font-size:.8rem;color:var(--muted);margin-top:6px">Successfully delivered</div></div>
    </div>
    <div class="panel" style="margin-top:24px">
      <div class="ptit">Top Destinations</div>
      <div id="top-destinations"></div>
    </div>
  </div>

  <!-- SUPPLIER DASHBOARD -->
  <div class="page" id="pg-supplier-dash">
    <div class="ptitle">Supplier Dashboard</div>
    <p class="psub">Welcome! Here are the bookings in your region that need fulfillment.</p>
    <div id="supplier-info-banner" class="info-banner" style="margin-bottom:24px">
      🚚 <strong>How it works:</strong> When a consumer books water in your region, it appears here. Contact the customer to arrange delivery. Once delivered, mark it as complete. AquaLink will process your payment within 48 hours of confirmed delivery.
    </div>
    <div class="cards">
      <div class="card"><div class="clabel">Available Orders</div><div class="cval" id="sup-available">-</div><div class="ctag">In your region</div></div>
      <div class="card"><div class="clabel">Your Deliveries</div><div class="cval" id="sup-deliveries">-</div><div class="ctag">Completed</div></div>
      <div class="card"><div class="clabel">Pending Payment</div><div class="cval" id="sup-pending-pay">-</div><div class="ctag">From AquaLink</div></div>
      <div class="card"><div class="clabel">Total Earned</div><div class="cval" id="sup-earned">-</div><div class="ctag">NGN</div></div>
    </div>
    <div class="panel">
      <div class="ptit">Available Bookings In Your Region</div>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:20px">These are paid bookings that need a supplier. Contact AquaLink at aqualink79@gmail.com to accept an order.</p>
      <div class="tscroll"><table>
        <thead><tr><th>Booking ID</th><th>Destination</th><th>Water Type</th><th>Volume</th><th>Priority</th><th>Est. Delivery</th><th>Action</th></tr></thead>
        <tbody id="sup-booking-rows"></tbody>
      </table></div>
      <div id="sup-empty" class="empty" style="display:none">
        <div style="font-size:2.5rem;margin-bottom:10px">📦</div>
        <p>No available bookings in your region right now.</p>
        <p style="font-size:.82rem;margin-top:8px;color:var(--muted)">Check back soon or contact us at aqualink79@gmail.com</p>
      </div>
    </div>
    <div class="panel">
      <div class="ptit">Contact AquaLink Team</div>
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:16px">To accept a booking or report a delivery, contact our team:</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <a href="mailto:aqualink79@gmail.com" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:12px;color:var(--glow);text-decoration:none;font-size:.88rem;font-weight:600">📧 aqualink79@gmail.com</a>
      </div>
    </div>
  </div>

  <!-- USERS PAGE (admin only) -->
  <div class="page" id="pg-users">
    <div class="ptitle">All Users</div>
    <p class="psub">Everyone registered on AquaLink.</p>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table><thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Organization</th><th>Country</th><th>Role</th><th>Joined</th></tr></thead><tbody id="user-rows"></tbody></table></div><div id="u-note" class="empty" style="display:none"><div style="font-size:2rem;margin-bottom:10px">🔒</div>Admin access required.</div></div>
  </div>
</div>

<div class="toast" id="toast"><span id="t-i">✅</span>&nbsp;<span id="t-m"></span></div>

<script>
var TOKEN = localStorage.getItem('aq_token');
var ME = null;
var selectedType = 'consumer';

// ── API ───────────────────────────────────────────────
async function api(method, path, data) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (data) opts.body = JSON.stringify(data);
  try { var r = await fetch('/api' + path, opts); return await r.json(); }
  catch(e) { return { error: 'Cannot reach server.' }; }
}

// ── LANDING STATS ─────────────────────────────────────
async function loadLandingStats() {
  var r = await api('GET', '/public-stats');
  if (r.error) return;
  animCount('land-bookings', r.totalBookings);
  animCount('land-users', r.totalUsers);
  var l = r.totalLitres;
  document.getElementById('land-litres').textContent = l>=1e6?(l/1e6).toFixed(1)+'M': l>=1000?(l/1000).toFixed(0)+'K': l||'0';
  animCount('land-suppliers', r.totalSuppliers);
}
function animCount(id, target) {
  var el = document.getElementById(id); if(!el) return;
  var start = performance.now(), dur = 1500;
  (function tick(now) {
    var p = Math.min((now-start)/dur, 1), v = Math.round(target * (1-Math.pow(1-p,3)));
    el.textContent = v.toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target.toLocaleString();
  })(start);
}

// ── AUTH MODAL ────────────────────────────────────────
function openAuth(tab, type) {
  selectedType = type || 'consumer';
  switchAuthTab(tab === 'login' ? 'login' : 'register');
  if (tab !== 'login') {
    selectType(selectedType);
    setTimeout(function() { document.getElementById('type-selector').scrollIntoView({behavior:'smooth'}); }, 100);
  }
  clearAuthMsg();
  document.getElementById('auth-overlay').classList.add('open');
}
function closeAuth() { document.getElementById('auth-overlay').classList.remove('open'); }
function closeOverlayOutside(e) { if(e.target === document.getElementById('auth-overlay')) closeAuth(); }

function switchAuthTab(tab) {
  document.querySelectorAll('.mtab').forEach(function(t,i){ t.classList.toggle('on', (tab==='login'&&i===0)||(tab==='register'&&i===1)); });
  document.getElementById('auth-login').style.display    = tab==='login'    ? 'block' : 'none';
  document.getElementById('auth-register').style.display = tab==='register' ? 'block' : 'none';
  clearAuthMsg();
}
function clearAuthMsg() { document.getElementById('merr').style.display='none'; document.getElementById('mok').style.display='none'; }
function showMErr(msg) { var e=document.getElementById('merr'); e.textContent=msg; e.style.display='block'; }
function showMOk(msg)  { var e=document.getElementById('mok');  e.textContent=msg; e.style.display='block'; }

function selectType(type) {
  selectedType = type;
  document.getElementById('type-consumer').classList.toggle('selected', type==='consumer');
  document.getElementById('type-supplier').classList.toggle('selected', type==='supplier');
  document.getElementById('r-supplier-extra').style.display = type==='supplier' ? 'block' : 'none';
  if (type==='supplier') {
    document.getElementById('r-role').value = 'supplier';
  } else {
    document.getElementById('r-role').value = 'user';
  }
}

async function doLogin() {
  clearAuthMsg();
  var email=document.getElementById('l-email').value.trim(), pass=document.getElementById('l-pass').value;
  if(!email||!pass){showMErr('Please enter your email and password.');return;}
  var btn=document.getElementById('l-btn'); btn.disabled=true; btn.textContent='Logging in...';
  var r=await api('POST','/login',{email:email,password:pass});
  btn.disabled=false; btn.textContent='LOGIN →';
  if(r.error){showMErr(r.error);return;}
  TOKEN=r.token; ME=r.user; localStorage.setItem('aq_token',TOKEN);
  showMOk('Welcome back, '+ME.name+'!');
  setTimeout(function(){closeAuth();startApp();},700);
}

async function doRegister() {
  clearAuthMsg();
  var name=document.getElementById('r-name').value.trim(), email=document.getElementById('r-email').value.trim(), pass=document.getElementById('r-pass').value, country=document.getElementById('r-country').value.trim(), org=document.getElementById('r-org').value.trim(), role=document.getElementById('r-role').value;
  if(!name||!email||!pass||!country){showMErr('Name, email, password and country are required.');return;}
  if(pass.length<6){showMErr('Password must be at least 6 characters.');return;}
  var supplierData = {};
  if(selectedType==='supplier'){
    supplierData = { waterTypes: document.getElementById('r-water-types').value, capacity: document.getElementById('r-capacity').value, regions: document.getElementById('r-regions').value };
  }
  var btn=document.getElementById('r-btn'); btn.disabled=true; btn.textContent='Creating account...';
  var r=await api('POST','/register',{name:name,email:email,password:pass,country:country,organization:org,role:role,userType:selectedType,supplierData:supplierData});
  btn.disabled=false; btn.textContent='CREATE ACCOUNT →';
  if(r.error){showMErr(r.error);return;}
  TOKEN=r.token; ME=r.user; localStorage.setItem('aq_token',TOKEN);
  showMOk(r.message);
  setTimeout(function(){closeAuth();startApp();},700);
}

function doLogout() {
  TOKEN=null; ME=null; localStorage.removeItem('aq_token');
  document.getElementById('app').style.display='none';
  document.getElementById('landing').style.display='block';
  toast('👋','Logged out. See you soon!');
}

// ── APP ───────────────────────────────────────────────
function startApp() {
  document.getElementById('landing').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('av').textContent=ME.name[0].toUpperCase();
  document.getElementById('uname').textContent=ME.name.split(' ')[0];
  document.getElementById('urole').textContent=ME.userType==='supplier'?'Supplier':ME.role.toUpperCase();
  document.getElementById('b-date').value=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
  // Show admin-only pages
  if(ME.role==='admin'){
    document.getElementById('growth-btn').style.display='block';
    document.getElementById('users-btn').style.display='block';
  }
  // Suppliers get their own dashboard
  if(ME.userType==='supplier'){
    document.getElementById('book-btn').style.display='none';
    document.getElementById('supplier-banner').style.display='block';
    document.getElementById('sup-dash-btn').style.display='block';
    // Auto navigate to supplier dash
    goPage('supplier-dash', document.getElementById('sup-dash-btn'));
  }
  loadDashboard();
}

function goPage(pg, btn) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.nb').forEach(function(b){b.classList.remove('on');});
  document.getElementById('pg-'+pg).classList.add('on');
  if(btn) btn.classList.add('on');
  if(pg==='dashboard')     loadDashboard();
  if(pg==='bookings')      loadBookings();
  if(pg==='suppliers-pg')  loadSuppliers();
  if(pg==='growth')        loadGrowth();
  if(pg==='users')         loadUsers();
  if(pg==='supplier-dash') loadSupplierDash();
}

// ── DASHBOARD ─────────────────────────────────────────
async function loadDashboard() {
  if(!ME) return;
  if(ME.role==='admin'){
    var r=await api('GET','/stats'); if(r.error) return;
    document.getElementById('s-total').textContent=r.totalBookings;
    document.getElementById('s-users').textContent=r.totalUsers;
    var l=r.totalLitres; document.getElementById('s-litres').textContent=l>=1e6?(l/1e6).toFixed(1)+'M':l>=1000?(l/1000).toFixed(0)+'K':l;
    document.getElementById('s-pending').textContent=r.byStatus.pending;
    document.getElementById('recent-rows').innerHTML=(r.recentBookings||[]).map(function(b){return '<tr><td class="bid">'+b.id+'</td><td>'+b.destination+'</td><td>'+fv(b.volumeLitres)+'</td><td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td><td><span class="badge '+sc(b.status)+'">'+b.status+'</span></td><td style="color:var(--muted);font-size:.8rem">'+b.createdAt.slice(0,10)+'</td></tr>';}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No bookings yet.</td></tr>';
    var total=r.totalBookings||1;
    document.getElementById('status-bars').innerHTML=Object.entries(r.byStatus).map(function(e){return '<div class="bar-item"><div class="bar-head"><span style="color:var(--ice);text-transform:capitalize">'+e[0]+'</span><span style="color:var(--glow)">'+e[1]+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+(e[1]/total*100)+'%"></div></div></div>';}).join('');
  } else {
    var r=await api('GET','/bookings');
    document.getElementById('s-total').textContent=r.total||0;
    document.getElementById('s-users').textContent='—';
    var tl=(r.bookings||[]).reduce(function(s,b){return s+b.volumeLitres;},0);
    document.getElementById('s-litres').textContent=tl>=1e6?(tl/1e6).toFixed(1)+'M':tl>=1000?(tl/1000).toFixed(0)+'K':tl;
    document.getElementById('s-pending').textContent=(r.bookings||[]).filter(function(b){return b.status==='pending';}).length;
    document.getElementById('recent-rows').innerHTML=(r.bookings||[]).slice(0,5).map(function(b){return '<tr><td class="bid">'+b.id+'</td><td>'+b.destination+'</td><td>'+fv(b.volumeLitres)+'</td><td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td><td><span class="badge '+sc(b.status)+'">'+b.status+'</span></td><td style="color:var(--muted);font-size:.8rem">'+b.createdAt.slice(0,10)+'</td></tr>';}).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No bookings yet.</td></tr>';
  }
}

// ── BOOKINGS ──────────────────────────────────────────
async function loadBookings() {
  var search=document.getElementById('f-search').value, status=document.getElementById('f-status').value;
  var r=await api('GET','/bookings?status='+status+(search?'&search='+encodeURIComponent(search):''));
  var tbody=document.getElementById('bk-rows'), empty=document.getElementById('bk-empty');
  if(!r.bookings||r.bookings.length===0){
    tbody.innerHTML='';
    empty.style.display='block';
    document.getElementById('bk-msg').innerHTML='No bookings yet.';
    return;
  }
  empty.style.display='none';
  var rows = '';
  for(var i=0;i<r.bookings.length;i++){
    var b = r.bookings[i];
    var statusCell = '';
    if(ME && ME.role==='admin'){
      statusCell = '<select class="ssel" onchange="updStatus(this.dataset.id,this.value)" data-id="'+b.id+'">';
      statusCell += '<option value="pending"'+(b.status==='pending'?' selected':'')+'>Pending</option>';
      statusCell += '<option value="active"'+(b.status==='active'?' selected':'')+'>Active</option>';
      statusCell += '<option value="transit"'+(b.status==='transit'?' selected':'')+'>In Transit</option>';
      statusCell += '<option value="complete"'+(b.status==='complete'?' selected':'')+'>Complete</option>';
      statusCell += '</select>';
    } else {
      statusCell = '<span class="badge '+sc(b.status)+'">'+b.status+'</span>';
    }
    var payCell = b.paid
      ? '<span style="color:var(--green);font-size:.78rem;font-weight:600">&#10003; Paid</span>'
      : '<button class="btn btn-p" style="padding:5px 11px;font-size:.75rem;margin-right:4px" data-bid="'+b.id+'" data-vol="'+b.volumeLitres+'" onclick="payBooking(this.dataset.bid,parseInt(this.dataset.vol))">Pay</button>';
    var cancelCell = '<button class="btn btn-d" style="padding:5px 11px;font-size:.75rem" data-bid="'+b.id+'" onclick="cancelB(this.dataset.bid)">Cancel</button>';
    rows += '<tr>';
    rows += '<td class="bid">'+b.id+'</td>';
    rows += '<td>'+b.destination+'</td>';
    rows += '<td style="color:var(--muted)">'+b.waterType+'</td>';
    rows += '<td style="font-weight:600">'+fv(b.volumeLitres)+'</td>';
    rows += '<td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td>';
    rows += '<td>'+statusCell+'</td>';
    rows += '<td style="color:var(--muted);font-size:.8rem">'+b.createdAt.slice(0,10)+'</td>';
    rows += '<td>'+payCell+' '+cancelCell+'</td>';
    rows += '</tr>';
  }
  tbody.innerHTML = rows;
}
async function updStatus(id,status){
  var r=await api('PUT','/bookings/'+id+'/status',{status:status});
  if(r.error){toast('❌',r.error);return;}
  toast('✅','Booking '+id+' updated to '+status);
}
async function cancelB(id){
  if(!confirm('Cancel booking '+id+'?'))return;
  var r=await api('DELETE','/bookings/'+id);
  if(r.error){toast('❌',r.error);return;}
  toast('🗑️','Cancelled.');
  loadBookings();
}

// ── BOOK WATER ────────────────────────────────────────
function pickPill(el){el.closest('.pills').querySelectorAll('.pill').forEach(function(p){p.classList.remove('on');});el.classList.add('on');}
function updVol(v){var n=parseInt(v);document.getElementById('vol-disp').textContent=n>=1e6?(n/1e6).toFixed(1)+'M L':n>=1000?(n/1000).toFixed(0)+'K L':n+' L';}
async function submitBook(){
  document.getElementById('b-err').style.display='none';
  var country=document.getElementById('b-country').value;
  if(!country){var e=document.getElementById('b-err');e.textContent='Please select a destination country.';e.style.display='block';return;}
  var pill=document.querySelector('.pill.on'), type=pill?pill.textContent.trim():'Potable';
  var btn=document.getElementById('b-btn');btn.disabled=true;btn.textContent='Confirming...';
  var r=await api('POST','/bookings',{destination:country,city:document.getElementById('b-city').value,waterType:type,volumeLitres:parseInt(document.getElementById('vol-slide').value),priority:document.getElementById('b-pri').value,requestorType:document.getElementById('b-rtype').value,requiredBy:document.getElementById('b-date').value,notes:document.getElementById('b-notes').value});
  btn.disabled=false;btn.textContent='CONFIRM BOOKING →';
  if(r.error){var e=document.getElementById('b-err');e.textContent=r.error;e.style.display='block';return;}
  document.getElementById('book-form').style.display='none';
  document.getElementById('book-success').style.display='block';
  document.getElementById('s-id').textContent=r.booking.id;
  document.getElementById('s-msg').textContent=r.message;
  currentBookingId = r.booking.id;
  currentBookingVol = r.booking.volumeLitres;
  var amountNaira = (r.booking.volumeLitres * PRICE_PER_LITRE_KOBO / 100).toLocaleString();
  document.getElementById('pay-amount').textContent = 'NGN ' + amountNaira;
  toast('✅','Booking '+r.booking.id+' confirmed!');
}
function resetBook(){document.getElementById('book-success').style.display='none';document.getElementById('book-form').style.display='block';['b-country','b-city','b-notes'].forEach(function(id){document.getElementById(id).value='';});document.getElementById('vol-slide').value=5000;document.getElementById('vol-disp').textContent='5,000 L';}

// ── SUPPLIERS ─────────────────────────────────────────
async function loadSuppliers(){
  var r=await api('GET','/suppliers');
  var tbody=document.getElementById('supplier-rows'), empty=document.getElementById('supplier-empty');
  if(!r.suppliers||r.suppliers.length===0){tbody.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  tbody.innerHTML=r.suppliers.map(function(s){return '<tr><td style="font-weight:600">'+s.name+'</td><td>'+s.organization+'</td><td>'+s.country+'</td><td style="color:var(--muted)">'+(s.waterTypes||'Potable')+'</td><td style="font-size:.82rem;color:var(--muted)">'+(s.regions||s.country)+'</td><td><span class="badge b-supplier">Verified</span></td></tr>';}).join('');
}

// ── GROWTH ────────────────────────────────────────────
async function loadGrowth(){
  var r=await api('GET','/stats'); if(r.error) return;
  document.getElementById('g-bookings').textContent=r.totalBookings;
  document.getElementById('g-users').textContent=r.totalUsers;
  document.getElementById('g-suppliers').textContent=r.totalSuppliers||0;
  var l=r.totalLitres; document.getElementById('g-litres').textContent=l>=1e6?(l/1e6).toFixed(1)+'M':l>=1000?(l/1000).toFixed(0)+'K':l;
  document.getElementById('g-emergency').textContent=r.byPriority.Emergency||0;
  document.getElementById('g-complete').textContent=r.byStatus.complete||0;
  // Top destinations
  var dest={}; (r.allBookings||[]).forEach(function(b){dest[b.destination]=(dest[b.destination]||0)+1;});
  var sorted=Object.entries(dest).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var max=sorted[0]?sorted[0][1]:1;
  document.getElementById('top-destinations').innerHTML=sorted.length?sorted.map(function(e){return '<div class="bar-item"><div class="bar-head"><span style="color:var(--ice)">'+e[0]+'</span><span style="color:var(--glow)">'+e[1]+' booking'+(e[1]>1?'s':'')+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+(e[1]/max*100)+'%"></div></div></div>';}).join(''):'<p style="color:var(--muted);font-size:.85rem">No bookings yet.</p>';
}

// ── SUPPLIER DASHBOARD ───────────────────────────────
async function loadSupplierDash() {
  var r = await api('GET', '/bookings?status=all');
  var allBookings = r.bookings || [];
  // Show paid bookings available for suppliers
  var available = allBookings.filter(function(b){ return b.paid && b.status !== 'complete'; });
  var completed  = allBookings.filter(function(b){ return b.status === 'complete' && b.userId === (ME && ME.id); }).length;
  document.getElementById('sup-available').textContent  = available.length;
  document.getElementById('sup-deliveries').textContent = completed;
  document.getElementById('sup-pending-pay').textContent = available.filter(function(b){ return b.status==='active'; }).length;
  document.getElementById('sup-earned').textContent = '—';
  var tbody = document.getElementById('sup-booking-rows');
  var empty  = document.getElementById('sup-empty');
  if (available.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = available.map(function(b) {
    var priColor = b.priority==='Emergency'?'var(--coral)':b.priority==='Urgent'?'var(--gold)':'var(--muted)';
    return '<tr>' +
      '<td class="bid">' + b.id + '</td>' +
      '<td>' + b.destination + '</td>' +
      '<td style="color:var(--muted)">' + b.waterType + '</td>' +
      '<td style="font-weight:600">' + fv(b.volumeLitres) + '</td>' +
      '<td style="color:' + priColor + ';font-weight:600">' + b.priority + '</td>' +
      '<td style="color:var(--muted)">' + (b.estimatedDelivery||'TBD') + '</td>' +
      '<td><a href="mailto:aqualink79@gmail.com?subject=Accept Order ' + b.id + '&body=I want to accept booking ' + b.id + ' for ' + b.destination + '" style="display:inline-block;padding:5px 12px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:8px;color:var(--glow);text-decoration:none;font-size:.78rem;font-weight:600">Accept Order</a></td>' +
      '</tr>';
  }).join('');
}

// ── USERS ─────────────────────────────────────────────
async function loadUsers(){
  var r=await api('GET','/users'); var note=document.getElementById('u-note');
  if(r.error){note.style.display='block';return;} note.style.display='none';
  document.getElementById('user-rows').innerHTML=(r.users||[]).map(function(u){
    var badge=u.userType==='supplier'?'b-supplier':u.role==='admin'?'b-crit':u.role==='ngo'?'b-transit':'b-pending';
    return '<tr><td style="font-weight:600">'+u.name+'</td><td style="color:var(--muted)">'+u.email+'</td><td><span class="badge '+badge+'">'+(u.userType||u.role)+'</span></td><td>'+(u.organization||'—')+'</td><td>'+(u.country||'—')+'</td><td><span class="badge b-pending">'+u.role+'</span></td><td style="color:var(--muted);font-size:.8rem">'+u.createdAt.slice(0,10)+'</td></tr>';
  }).join('');
}

// ── UTILS ─────────────────────────────────────────────
function fv(l){return l>=1e6?(l/1e6).toFixed(1)+'M L':l>=1000?(l/1000).toFixed(0)+'K L':l+' L';}
function pc(p){return p==='Emergency'?'b-crit':p==='Urgent'?'b-pending':'b-complete';}
function sc(s){return s==='active'?'b-active':s==='pending'?'b-pending':s==='transit'?'b-transit':'b-complete';}
function toast(ico,msg){document.getElementById('t-i').textContent=ico;document.getElementById('t-m').textContent=msg;var t=document.getElementById('toast');t.classList.add('show');setTimeout(function(){t.classList.remove('show');},4000);}

// ── BOOT ──────────────────────────────────────────────
// ── PAYMENT ───────────────────────────────────────────
var currentBookingId = null;
var currentBookingVol = 0;
var paystackKey = '';

// Price per litre in Kobo (NGN)
var PRICE_PER_LITRE_KOBO = 10;

async function getPaystackKey() {
  if (paystackKey) return paystackKey;
  var r = await api('GET', '/paystack-key');
  paystackKey = r.publicKey || '';
  return paystackKey;
}

async function openPaystack(bookingId, volumeLitres) {
  if (!ME) { toast('❌', 'Please log in first.'); return; }
  currentBookingId = bookingId;
  currentBookingVol = parseInt(volumeLitres);
  var amount = currentBookingVol * PRICE_PER_LITRE_KOBO;
  if (amount < 100) amount = 100;
  var ref = 'AQL' + Date.now();

  toast('⏳', 'Opening payment...');

  // Initialize payment via server
  var r = await api('POST', '/init-payment', {
    email: ME.email,
    amount: amount,
    reference: ref,
    bookingId: bookingId
  });

  if (r.error) { toast('❌', r.error); return; }

  // Open Paystack checkout in popup
  var popupWidth = 520;
  var popupHeight = 620;
  var left = (window.screen.width - popupWidth) / 2;
  var top = (window.screen.height - popupHeight) / 2;
  var popup = window.open(
    r.url,
    'AquaLink Payment',
    'width=' + popupWidth + ',height=' + popupHeight + ',left=' + left + ',top=' + top + ',scrollbars=yes'
  );

  if (!popup || popup.closed) {
    // Popup blocked — redirect instead
    toast('ℹ️', 'Redirecting to payment page...');
    window.location.href = r.url;
    return;
  }

  toast('💳', 'Complete your payment in the popup window!');

  // Poll for popup close
  var checkInterval = setInterval(function() {
    if (popup.closed) {
      clearInterval(checkInterval);
      // Verify payment
      toast('⏳', 'Verifying payment...');
      api('POST', '/verify-payment', {
        reference: r.reference || ref,
        bookingId: bookingId
      }).then(function(vr) {
        if (vr.success) {
          toast('✅', 'Payment confirmed! Your booking is now active.');
          loadBookings();
        } else {
          toast('ℹ️', 'Payment not completed. You can pay anytime from My Bookings.');
          loadBookings();
        }
      });
    }
  }, 1500);
}

function verifyAndClear(ref, bookingId) {
  toast('⏳', 'Verifying payment...');
  api('POST', '/verify-payment', { reference: ref, bookingId: bookingId }).then(function(r) {
    // Clear URL params
    window.history.replaceState({}, document.title, window.location.pathname);
    if (r.success) {
      toast('✅', 'Payment confirmed! Your booking is now active.');
      loadBookings();
    } else {
      toast('❌', r.error || 'Payment verification failed.');
    }
  });
}

async function payNow() {
  await openPaystack(currentBookingId, currentBookingVol);
}

async function payBooking(bookingId, volumeLitres) {
  await openPaystack(bookingId, parseInt(volumeLitres));
}

// Check for payment return on page load
(function checkPaymentReturn() {
  var urlParams = new URLSearchParams(window.location.search);
  var payref = urlParams.get('payref');
  var booking = urlParams.get('booking');
  if (payref && booking) {
    verifyAndClear(payref, booking);
  }
})();

// ── CONTACT FORM ─────────────────────────────────────
async function sendContact() {
  var name    = document.getElementById('c-name').value.trim();
  var email   = document.getElementById('c-email').value.trim();
  var subject = document.getElementById('c-subject').value;
  var msg     = document.getElementById('c-msg').value.trim();
  var result  = document.getElementById('c-result');
  if (!name || !email || !msg) {
    result.style.display = 'block';
    result.style.color = 'var(--coral)';
    result.textContent = 'Please fill in all fields.';
    return;
  }
  result.style.display = 'block';
  result.style.color = 'var(--muted)';
  result.textContent = 'Sending...';
  var r = await api('POST', '/contact', { name: name, email: email, subject: subject, message: msg });
  if (r.success) {
    result.style.color = 'var(--green)';
    result.textContent = '✅ Message sent! We will reply within 24 hours.';
    document.getElementById('c-name').value = '';
    document.getElementById('c-email').value = '';
    document.getElementById('c-msg').value = '';
  } else {
    result.style.color = 'var(--coral)';
    result.textContent = '❌ Failed to send. Please email us directly at aqualink79@gmail.com';
  }
}

// ── LEGAL MODALS ─────────────────────────────────────
function openModal(id) {
  document.getElementById(id).style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = '';
}

loadLandingStats();
(async function boot(){
  if(TOKEN){var r=await api('GET','/me');if(!r.error){ME=r.user;startApp();return;}localStorage.removeItem('aq_token');TOKEN=null;}
})();
</script>
</body>
</html>`;

// ─── SERVER ───────────────────────────────────────────
seedData();

http.createServer(async function(req, res) {
  var method = req.method;
  var rawUrl = req.url.split('?')[0];
  var qs = req.url.split('?')[1] || '';
  var query = {};
  qs.split('&').forEach(function(p){ var kv=p.split('='); if(kv[0]) query[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||''); });

  setCORS(res);
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (!rawUrl.startsWith('/api')) { sendHTML(res, HTML); return; }

  var route = rawUrl.replace('/api','') || '/';

  // GET /api/public-stats (no auth needed — for landing page)
  if (route === '/public-stats' && method === 'GET') {
    var db = loadDB();
    var suppliers = (db.users||[]).filter(function(u){ return u.userType === 'supplier'; });
    return sendJSON(res, 200, {
      totalBookings: db.bookings.length,
      totalUsers: db.users.length,
      totalLitres: db.bookings.reduce(function(s,b){ return s+(b.volumeLitres||0); }, 0),
      totalSuppliers: suppliers.length
    });
  }

  // POST /api/register
  if (route === '/register' && method === 'POST') {
    var data = await getBody(req);
    if (!data.name||!data.email||!data.password) return sendJSON(res,400,{error:'Name, email and password are required.'});
    if (data.password.length<6) return sendJSON(res,400,{error:'Password must be at least 6 characters.'});
    var db = loadDB();
    if (db.users.find(function(u){return u.email===data.email;})) return sendJSON(res,409,{error:'Email already registered. Please log in.'});
    var user = { id:makeId(), name:data.name, email:data.email, passwordHash:hashPassword(data.password), role:data.role||'user', organization:data.organization||'', country:data.country||'', userType:data.userType||'consumer', createdAt:new Date().toISOString() };
    db.users.push(user);
    // If supplier, add to suppliers list
    if (data.userType === 'supplier') {
      db.suppliers = db.suppliers || [];
      db.suppliers.push({ id:user.id, name:user.name, organization:user.organization||user.name, country:user.country, waterTypes:data.supplierData&&data.supplierData.waterTypes||'Potable', capacity:data.supplierData&&data.supplierData.capacity||'', regions:data.supplierData&&data.supplierData.regions||user.country, createdAt:user.createdAt });
    }
    saveDB(db);
    var msg = data.userType==='supplier' ? 'Welcome! Your supplier application has been received. Our team will verify your account within 24 hours.' : 'Welcome to AquaLink, '+data.name+'! You can now book water.';
    // Send welcome emails
    sendWelcomeEmail(user);
    return sendJSON(res,201,{message:msg, user:safeUser(user), token:makeToken(user)});
  }

  // POST /api/login
  if (route === '/login' && method === 'POST') {
    var data = await getBody(req);
    if (!data.email||!data.password) return sendJSON(res,400,{error:'Email and password are required.'});
    var db = loadDB();
    var user = db.users.find(function(u){return u.email===data.email;});
    if (!user||hashPassword(data.password)!==user.passwordHash) return sendJSON(res,401,{error:'Wrong email or password.'});
    return sendJSON(res,200,{message:'Welcome back, '+user.name+'!', user:safeUser(user), token:makeToken(user)});
  }

  // GET /api/me
  if (route === '/me' && method === 'GET') {
    var auth = checkToken(getToken(req)); if(!auth) return sendJSON(res,401,{error:'Please log in.'});
    var db = loadDB(); var user = db.users.find(function(u){return u.id===auth.id;});
    if(!user) return sendJSON(res,404,{error:'User not found.'});
    return sendJSON(res,200,{user:safeUser(user)});
  }

  // GET /api/bookings
  if (route === '/bookings' && method === 'GET') {
    var auth = checkToken(getToken(req)); if(!auth) return sendJSON(res,401,{error:'Please log in.'});
    var db = loadDB();
    var list = auth.role==='admin' ? db.bookings : db.bookings.filter(function(b){return b.userId===auth.id;});
    if(query.status&&query.status!=='all') list=list.filter(function(b){return b.status===query.status;});
    if(query.search){var s=query.search.toLowerCase();list=list.filter(function(b){return b.destination.toLowerCase().indexOf(s)>-1||b.id.toLowerCase().indexOf(s)>-1;});}
    list=list.sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt);});
    return sendJSON(res,200,{bookings:list,total:list.length});
  }

  // POST /api/bookings
  if (route === '/bookings' && method === 'POST') {
    var auth = checkToken(getToken(req)); if(!auth) return sendJSON(res,401,{error:'Please log in.'});
    var data = await getBody(req);
    if(!data.destination||!data.waterType||!data.volumeLitres) return sendJSON(res,400,{error:'Destination, water type and volume are required.'});
    var db = loadDB();
    var days = data.priority==='Emergency'?2:data.priority==='Urgent'?4:14;
    var booking = { id:nextBookingId(), userId:auth.id, destination:data.city?data.city+', '+data.destination:data.destination, waterType:data.waterType, volumeLitres:parseInt(data.volumeLitres), priority:data.priority||'Standard', status:'pending', requestorType:data.requestorType||'Individual', requiredBy:data.requiredBy||'', notes:data.notes||'', createdAt:new Date().toISOString(), estimatedDelivery:new Date(Date.now()+days*86400000).toISOString().slice(0,10) };
    db.bookings.push(booking); saveDB(db);
    // Send booking emails
    var booker = db.users.find(function(u){return u.id===auth.id;});
    if(booker) { sendBookingEmails(booking, booker.name, booker.email); }
    return sendJSON(res,201,{message:'Booking '+booking.id+' confirmed! A confirmation email has been sent to you.', booking:booking});
  }

  // PUT /api/bookings/:id/status
  var smatch = route.match(/^\/bookings\/(.+)\/status$/);
  if (smatch && method === 'PUT') {
    var auth = checkToken(getToken(req)); if(!auth||auth.role!=='admin') return sendJSON(res,403,{error:'Admin only.'});
    var data = await getBody(req); var db = loadDB();
    var idx = db.bookings.findIndex(function(b){return b.id===smatch[1];});
    if(idx===-1) return sendJSON(res,404,{error:'Not found.'});
    db.bookings[idx].status=data.status; saveDB(db);
    return sendJSON(res,200,{message:'Updated!',booking:db.bookings[idx]});
  }

  // DELETE /api/bookings/:id
  var dmatch = route.match(/^\/bookings\/(.+)$/);
  if (dmatch && method === 'DELETE') {
    var auth = checkToken(getToken(req)); if(!auth) return sendJSON(res,401,{error:'Please log in.'});
    var db = loadDB(); var idx=db.bookings.findIndex(function(b){return b.id===dmatch[1];});
    if(idx===-1) return sendJSON(res,404,{error:'Not found.'});
    if(auth.role!=='admin'&&db.bookings[idx].userId!==auth.id) return sendJSON(res,403,{error:'Access denied.'});
    db.bookings.splice(idx,1); saveDB(db);
    return sendJSON(res,200,{message:'Booking cancelled.'});
  }

  // GET /api/suppliers
  if (route === '/suppliers' && method === 'GET') {
    var db = loadDB();
    return sendJSON(res,200,{suppliers:db.suppliers||[]});
  }

  // GET /api/stats
  if (route === '/stats' && method === 'GET') {
    var auth = checkToken(getToken(req)); if(!auth||auth.role!=='admin') return sendJSON(res,403,{error:'Admin only.'});
    var db = loadDB();
    return sendJSON(res,200,{
      totalBookings:db.bookings.length, totalUsers:db.users.length,
      totalSuppliers:(db.suppliers||[]).length,
      totalLitres:db.bookings.reduce(function(s,b){return s+(b.volumeLitres||0);},0),
      byStatus:{pending:db.bookings.filter(function(b){return b.status==='pending';}).length,active:db.bookings.filter(function(b){return b.status==='active';}).length,transit:db.bookings.filter(function(b){return b.status==='transit';}).length,complete:db.bookings.filter(function(b){return b.status==='complete';}).length},
      byPriority:{Emergency:db.bookings.filter(function(b){return b.priority==='Emergency';}).length,Urgent:db.bookings.filter(function(b){return b.priority==='Urgent';}).length,Standard:db.bookings.filter(function(b){return b.priority==='Standard';}).length},
      recentBookings:db.bookings.slice(-5).reverse(),
      allBookings:db.bookings
    });
  }

  // GET /api/users
  if (route === '/users' && method === 'GET') {
    var auth = checkToken(getToken(req)); if(!auth||auth.role!=='admin') return sendJSON(res,403,{error:'Admin only.'});
    return sendJSON(res,200,{users:loadDB().users.map(safeUser),total:loadDB().users.length});
  }

  // POST /api/contact
  if (route === '/contact' && method === 'POST') {
    var data = await getBody(req);
    if (!data.name || !data.email || !data.message) return sendJSON(res, 400, { error: 'All fields required.' });
    var html = emailWrap(
      '<h2>📩 New Contact Message</h2>' +
      '<table>' +
      '<tr><td>From</td><td>' + data.name + '</td></tr>' +
      '<tr><td>Email</td><td>' + data.email + '</td></tr>' +
      '<tr><td>Subject</td><td>' + data.subject + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:20px;padding:16px;background:#f8fafb;border-radius:10px;color:#333;font-size:.9rem;line-height:1.7">' + data.message + '</div>' +
      '<p style="margin-top:16px;font-size:.82rem;color:#4a7a9b">Reply directly to: <a href="mailto:' + data.email + '">' + data.email + '</a></p>'
    );
    await sendEmail(ADMIN_EMAIL, '📩 AquaLink Contact: ' + data.subject + ' — ' + data.name, html);
    // Send auto-reply to sender
    var replyHtml = emailWrap(
      '<h2>✅ Message Received!</h2>' +
      '<p>Thank you for contacting AquaLink, <strong>' + data.name + '</strong>!</p>' +
      '<p>We have received your message and will respond within 24 hours.</p>' +
      '<table>' +
      '<tr><td>Subject</td><td>' + data.subject + '</td></tr>' +
      '<tr><td>Received</td><td>' + new Date().toLocaleString() + '</td></tr>' +
      '</table>' +
      '<p style="margin-top:16px;color:#4a7a9b;font-size:.85rem">If you need urgent assistance, email us directly at aqualink79@gmail.com</p>'
    );
    sendEmail(data.email, '✅ AquaLink — We received your message!', replyHtml);
    return sendJSON(res, 200, { success: true });
  }

  // GET /api/paystack-key
  if (route === '/paystack-key' && method === 'GET') {
    return sendJSON(res, 200, { publicKey: PAYSTACK_PUBLIC });
  }

  // POST /api/init-payment
  if (route === '/init-payment' && method === 'POST') {
    var auth = checkToken(getToken(req));
    if (!auth) return sendJSON(res, 401, { error: 'Please log in.' });
    var data = await getBody(req);
    var https = require('https');
    var payload = JSON.stringify({
      email: data.email,
      amount: data.amount,
      reference: data.reference,
      currency: 'NGN',
      metadata: { bookingId: data.bookingId }
    });
    var result = await new Promise(function(resolve) {
      var options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: '/transaction/initialize',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + PAYSTACK_SECRET,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      var req2 = https.request(options, function(res2) {
        var body = '';
        res2.on('data', function(c) { body += c; });
        res2.on('end', function() {
          try { resolve(JSON.parse(body)); }
          catch(e) { resolve({ status: false }); }
        });
      });
      req2.on('error', function(e) { resolve({ status: false, message: e.message }); });
      req2.write(payload);
      req2.end();
    });
    if (result.status && result.data && result.data.authorization_url) {
      return sendJSON(res, 200, { url: result.data.authorization_url, reference: result.data.reference });
    } else {
      return sendJSON(res, 400, { error: result.message || 'Could not initialize payment.' });
    }
  }

  // POST /api/verify-payment
  if (route === '/verify-payment' && method === 'POST') {
    var auth = checkToken(getToken(req));
    if (!auth) return sendJSON(res, 401, { error: 'Please log in.' });
    var data = await getBody(req);
    var reference = data.reference;
    var bookingId = data.bookingId;
    if (!reference) return sendJSON(res, 400, { error: 'Payment reference required.' });

    // Verify with Paystack
    var https = require('https');
    var verified = await new Promise(function(resolve) {
      var options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: '/transaction/verify/' + reference,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + PAYSTACK_SECRET,
          'Content-Type': 'application/json'
        }
      };
      var req2 = https.request(options, function(res2) {
        var body = '';
        res2.on('data', function(c) { body += c; });
        res2.on('end', function() {
          try {
            var result = JSON.parse(body);
            resolve(result);
          } catch(e) { resolve({ status: false }); }
        });
      });
      req2.on('error', function() { resolve({ status: false }); });
      req2.end();
    });

    if (verified.status && verified.data && verified.data.status === 'success') {
      // Payment confirmed - update booking
      var db = loadDB();
      var idx = db.bookings.findIndex(function(b) { return b.id === bookingId; });
      if (idx !== -1) {
        db.bookings[idx].paid = true;
        db.bookings[idx].paymentRef = reference;
        db.bookings[idx].amountPaid = verified.data.amount / 100;
        db.bookings[idx].currency = verified.data.currency;
        db.bookings[idx].paidAt = new Date().toISOString();
        saveDB(db);
        // Send payment confirmation email
        var booker = db.users.find(function(u) { return u.id === auth.id; });
        if (booker) {
          sendPaymentEmail(db.bookings[idx], booker.name, booker.email, verified.data.amount / 100, verified.data.currency);
        }
      }
      return sendJSON(res, 200, { success: true, message: 'Payment confirmed! Your booking is now active.', amount: verified.data.amount / 100, currency: verified.data.currency });
    } else {
      return sendJSON(res, 400, { error: 'Payment verification failed. Please contact support.' });
    }
  }

  sendJSON(res,404,{error:'Not found.'});

}).listen(PORT, function() {
  console.log('');
  console.log('========================================');
  console.log('   AQUALINK v5 IS RUNNING!');
  console.log('========================================');
  console.log('   Open:     http://localhost:' + PORT);
  console.log('   Admin:    admin@aqualink.org');
  console.log('   Password: admin123');
  console.log('========================================');
  console.log('');
});



