/**
 * AQUALINK - COMPLETE PLATFORM
 * Run: node server.js
 * Open: http://localhost:3000
 * Admin: admin@aqualink.org / admin123
 */

var http   = require('http');
var fs     = require('fs');
var path   = require('path');
var crypto = require('crypto');

var PORT           = process.env.PORT || 3000;
var SECRET         = 'aqualink2026';
var DBFILE         = path.join(__dirname, 'database.json');
var RESEND_KEY     = process.env.RESEND_KEY     || 're_EiMBpMft_AuK6VCRGB7RaUUWfxR3JD2KJ';
var ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'aqualink79@gmail.com';
var FROM_EMAIL     = 'noreply@aqualinkglobal.com';
var PAYSTACK_PUB   = process.env.PAYSTACK_PUBLIC || 'pk_test_f01988149ae68d04ac03ed5f5ed887af26ce3787';
var PAYSTACK_SEC   = process.env.PAYSTACK_SECRET || 'sk_test_5d4f5870cc2f185648fc85d2563ee0086094f8a7';

// ── DATABASE ──────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DBFILE)) return { users:[], bookings:[], suppliers:[] };
  try { return JSON.parse(fs.readFileSync(DBFILE,'utf8')); }
  catch(e) { return { users:[], bookings:[], suppliers:[] }; }
}
function saveDB(db) { fs.writeFileSync(DBFILE, JSON.stringify(db,null,2)); }
function uid()  { return crypto.randomBytes(6).toString('hex'); }
function hashPw(pw) { return crypto.createHmac('sha256',SECRET).update(pw).digest('hex'); }
function makeToken(u) {
  var p = Buffer.from(JSON.stringify({id:u.id,role:u.role,exp:Date.now()+7*86400000})).toString('base64');
  var s = crypto.createHmac('sha256',SECRET).update(p).digest('base64');
  return p+'.'+s;
}
function checkToken(tok) {
  if (!tok) return null;
  var parts = (tok||'').split('.');
  if (parts.length!==2) return null;
  if (crypto.createHmac('sha256',SECRET).update(parts[0]).digest('base64')!==parts[1]) return null;
  try { var d=JSON.parse(Buffer.from(parts[0],'base64').toString()); return d.exp>Date.now()?d:null; }
  catch(e) { return null; }
}
function getToken(req) { return (req.headers['authorization']||'').replace('Bearer ',''); }
function getBody(req) {
  return new Promise(function(resolve){
    var b=''; req.on('data',function(c){b+=c;}); req.on('end',function(){try{resolve(JSON.parse(b||'{}'));}catch(e){resolve({});}});
  });
}
function nextId() {
  var db=loadDB(), max=0;
  db.bookings.forEach(function(b){var n=parseInt((b.id||'AQL-0').replace('AQL-',''))||0;if(n>max)max=n;});
  return 'AQL-'+String(max+1).padStart(5,'0');
}
function safeUser(u) { return {id:u.id,name:u.name,email:u.email,role:u.role,organization:u.organization,country:u.country,userType:u.userType,createdAt:u.createdAt}; }

// ── SEED ──────────────────────────────────────────────
function seed() {
  var db=loadDB();
  if (db.users.length>0) return;
  var aid=uid(), nid=uid();
  db.users=[
    {id:aid,name:'Admin User',email:'admin@aqualink.org',passwordHash:hashPw('admin123'),role:'admin',organization:'AquaLink HQ',country:'Global',userType:'admin',createdAt:new Date().toISOString()},
    {id:nid,name:'WaterAid Nigeria',email:'ngo@wateraid.org',passwordHash:hashPw('test123'),role:'ngo',organization:'WaterAid',country:'Nigeria',userType:'consumer',createdAt:new Date().toISOString()}
  ];
  db.bookings=[
    {id:'AQL-00001',userId:nid,destination:'Lagos, Nigeria',waterType:'Potable',volumeLitres:50000,priority:'Emergency',status:'active',requestorType:'NGO',requiredBy:'2026-05-02',notes:'Flood relief',paid:false,createdAt:new Date().toISOString(),estimatedDelivery:'2026-05-04'},
    {id:'AQL-00002',userId:nid,destination:'Nairobi, Kenya',waterType:'Potable',volumeLitres:120000,priority:'Urgent',status:'transit',requestorType:'Government',requiredBy:'2026-05-05',notes:'',paid:false,createdAt:new Date().toISOString(),estimatedDelivery:'2026-05-07'},
  ];
  db.suppliers=[];
  saveDB(db);
  console.log('Demo data created!');
}

// ── EMAIL ─────────────────────────────────────────────
function sendEmail(to, subject, body) {
  return new Promise(function(resolve){
    try {
      var https=require('https');
      var payload=JSON.stringify({from:'AquaLink <'+FROM_EMAIL+'>',to:[to],subject:subject,html:body});
      var opts={hostname:'api.resend.com',port:443,path:'/emails',method:'POST',headers:{'Authorization':'Bearer '+RESEND_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}};
      var req=https.request(opts,function(res){
        var d=''; res.on('data',function(c){d+=c;}); res.on('end',function(){
          if(res.statusCode===200||res.statusCode===201){console.log('Email sent to:',to);}
          else{console.log('Email failed:',res.statusCode,d.slice(0,100));}
          resolve();
        });
      });
      req.on('error',function(e){console.log('Email error:',e.message);resolve();});
      req.write(payload); req.end();
    } catch(e){console.log('Email exception:',e.message);resolve();}
  });
}
function emailWrap(body) {
  return '<!DOCTYPE html><html><head><meta charset=UTF-8><style>body{margin:0;padding:20px;background:#f0f4f8;font-family:Arial,sans-serif}.wrap{max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}.head{background:linear-gradient(135deg,#1578c8,#00e5ff);padding:28px;text-align:center}.head h1{color:#010b14;font-size:1.5rem;letter-spacing:3px;margin:0}.body{padding:28px}.body h2{color:#1578c8;font-size:1.1rem;margin-bottom:12px}.body p{color:#333;font-size:.9rem;line-height:1.6;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:10px 12px;border-bottom:1px solid #f0f4f8;font-size:.88rem}td:first-child{color:#4a7a9b;font-weight:600;width:38%}td:last-child{color:#021525;font-weight:500}.cta{display:inline-block;margin-top:16px;padding:13px 30px;background:linear-gradient(135deg,#1578c8,#00e5ff);color:#010b14;text-decoration:none;border-radius:100px;font-weight:700;font-size:.88rem}.foot{background:#f8fafb;padding:16px;text-align:center;font-size:.75rem;color:#4a7a9b;border-top:1px solid #eee}</style></head><body><div class=wrap><div class=head><h1>AQUALINK</h1><p style="color:#010b14;font-size:.85rem;margin:4px 0 0;opacity:.8">Global Water Distribution Platform</p></div><div class=body>'+body+'</div><div class=foot>AquaLink Global &bull; aqualink79@gmail.com &bull; Automated message</div></div></body></html>';
}
function fmtVol(l){return l>=1e6?(l/1e6).toFixed(1)+'M L':l>=1000?(l/1000).toFixed(0)+'K L':l+' L';}

function emailNewBooking(booking,userName,userEmail){
  var priColor=booking.priority==='Emergency'?'#ff6b6b':booking.priority==='Urgent'?'#ffd166':'#4a7a9b';
  var adminHtml=emailWrap('<h2>New Water Booking!</h2><p>A new booking was submitted on AquaLink.</p><table><tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">'+booking.id+'</td></tr><tr><td>From</td><td>'+userName+' ('+userEmail+')</td></tr><tr><td>Destination</td><td>'+booking.destination+'</td></tr><tr><td>Water Type</td><td>'+booking.waterType+'</td></tr><tr><td>Volume</td><td>'+fmtVol(booking.volumeLitres)+'</td></tr><tr><td>Priority</td><td style="color:'+priColor+';font-weight:700">'+booking.priority+'</td></tr><tr><td>Est. Delivery</td><td>'+booking.estimatedDelivery+'</td></tr></table><a class=cta href="https://aqualink-1.onrender.com">Open Dashboard</a>');
  var custHtml=emailWrap('<h2>Booking Confirmed!</h2><p>Thank you <strong>'+userName+'</strong>! Your water booking has been received.</p><table><tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">'+booking.id+'</td></tr><tr><td>Destination</td><td>'+booking.destination+'</td></tr><tr><td>Volume</td><td>'+fmtVol(booking.volumeLitres)+'</td></tr><tr><td>Priority</td><td>'+booking.priority+'</td></tr><tr><td>Est. Delivery</td><td>'+booking.estimatedDelivery+'</td></tr></table><p>Our team will contact you within 24 hours to coordinate delivery.</p><a class=cta href="https://aqualink-1.onrender.com">Track Your Booking</a>');
  sendEmail(ADMIN_EMAIL,'New Booking '+booking.id+' - '+booking.priority+' - '+booking.destination,adminHtml);
  sendEmail(userEmail,'Booking Confirmed - '+booking.id,custHtml);
  if(userEmail!==ADMIN_EMAIL) sendEmail(ADMIN_EMAIL,'Forward to Customer ('+userEmail+'): Booking '+booking.id,custHtml);
}

function emailWelcome(user){
  var isSupplier=user.userType==='supplier';
  var adminHtml=emailWrap('<h2>New '+(isSupplier?'Supplier':'User')+' Registered!</h2><table><tr><td>Name</td><td>'+user.name+'</td></tr><tr><td>Email</td><td>'+user.email+'</td></tr><tr><td>Type</td><td>'+(isSupplier?'Water Supplier':'Consumer')+'</td></tr><tr><td>Organization</td><td>'+(user.organization||'—')+'</td></tr><tr><td>Country</td><td>'+(user.country||'—')+'</td></tr></table><a class=cta href="https://aqualink-1.onrender.com">View Dashboard</a>');
  sendEmail(ADMIN_EMAIL,'New '+(isSupplier?'Supplier':'User')+': '+user.name+' from '+(user.country||'?'),adminHtml);
  var userHtml=isSupplier
    ? emailWrap('<h2>Supplier Application Received!</h2><p>Thank you <strong>'+user.name+'</strong>! Your application has been received.</p><table><tr><td>Step 1</td><td>Team reviews application (24 hours)</td></tr><tr><td>Step 2</td><td>Verification of water supply capacity</td></tr><tr><td>Step 3</td><td>You receive Verified Supplier badge</td></tr><tr><td>Step 4</td><td>Start receiving booking requests</td></tr></table><p>Questions? Email aqualink79@gmail.com</p>')
    : emailWrap('<h2>Welcome to AquaLink!</h2><p>Your account is ready, <strong>'+user.name+'</strong>! You can now book clean water for your community.</p><table><tr><td>Email</td><td>'+user.email+'</td></tr><tr><td>Country</td><td>'+(user.country||'—')+'</td></tr></table><p>You can now book water, track deliveries, and request emergency supplies.</p><a class=cta href="https://aqualink-1.onrender.com">Book Water Now</a>');
  sendEmail(user.email,isSupplier?'AquaLink Supplier Application Received':'Welcome to AquaLink!',userHtml);
  if(user.email!==ADMIN_EMAIL) sendEmail(ADMIN_EMAIL,'Forward to '+(isSupplier?'Supplier':'User')+' ('+user.email+'): Welcome Email',userHtml);
}

function emailPayment(booking,userName,userEmail,amount,currency){
  var adminHtml=emailWrap('<h2>Payment Received!</h2><table><tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">'+booking.id+'</td></tr><tr><td>Customer</td><td>'+userName+'</td></tr><tr><td>Amount</td><td style="color:#06d6a0;font-weight:700">'+currency+' '+amount.toLocaleString()+'</td></tr><tr><td>Destination</td><td>'+booking.destination+'</td></tr></table><a class=cta href="https://aqualink-1.onrender.com">View Dashboard</a>');
  var custHtml=emailWrap('<h2>Payment Confirmed!</h2><p>Thank you <strong>'+userName+'</strong>! Your payment has been received and your booking is now active.</p><table><tr><td>Booking ID</td><td style="color:#00e5ff;font-weight:700">'+booking.id+'</td></tr><tr><td>Amount Paid</td><td style="color:#06d6a0;font-weight:700">'+currency+' '+amount.toLocaleString()+'</td></tr><tr><td>Status</td><td>Active - being coordinated</td></tr></table><p>Our team will coordinate your delivery. You will be contacted within 24 hours.</p><a class=cta href="https://aqualink-1.onrender.com">Track Booking</a>');
  sendEmail(ADMIN_EMAIL,'Payment Received - '+booking.id+' - '+currency+' '+amount,adminHtml);
  sendEmail(userEmail,'Payment Confirmed - AquaLink Booking '+booking.id,custHtml);
  if(userEmail!==ADMIN_EMAIL) sendEmail(ADMIN_EMAIL,'Forward to Customer ('+userEmail+'): Payment Receipt',custHtml);
}

function emailSupplierApproved(sup,userEmail){
  var html=emailWrap('<h2>You are now a Verified AquaLink Supplier!</h2><p>Dear <strong>'+sup.name+'</strong>, your supplier application has been <strong style="color:#06d6a0">approved!</strong></p><table><tr><td>Status</td><td style="color:#06d6a0;font-weight:700">Verified Supplier</td></tr><tr><td>Organization</td><td>'+sup.organization+'</td></tr><tr><td>Coverage</td><td>'+sup.regions+'</td></tr><tr><td>Water Types</td><td>'+sup.waterTypes+'</td></tr></table><p>You will now start receiving booking requests. Log in to your dashboard to see available orders.</p><a class=cta href="https://aqualink-1.onrender.com">Login to Dashboard</a>');
  sendEmail(userEmail,'You are a Verified AquaLink Supplier!',html);
  sendEmail(ADMIN_EMAIL,'Supplier Approved: '+sup.name,html);
}

// ── RESPONSE ──────────────────────────────────────────
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');}
function json(res,status,data){cors(res);res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
function html(res,body){cors(res);res.writeHead(200,{'Content-Type':'text/html'});res.end(body);}

// ── POLICY PAGE TEMPLATE ──────────────────────────────
function policyPage(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — AquaLink</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:#010b14;color:#c8f0ff;min-height:100vh}
.topbar{background:rgba(1,11,20,0.98);border-bottom:1px solid rgba(0,229,255,0.1);padding:16px 48px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:3px;color:#fff;display:flex;align-items:center;gap:10px;text-decoration:none}
.lm{width:24px;height:24px;background:linear-gradient(135deg,#1578c8,#00e5ff);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%)}
.back{padding:8px 18px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.25);color:#c8f0ff;background:transparent;font-family:'Outfit',sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;text-decoration:none;transition:all .2s}
.back:hover{border-color:#00e5ff;color:#00e5ff}
.wrap{max-width:760px;margin:0 auto;padding:60px 24px 80px}
.tag{font-size:.7rem;text-transform:uppercase;letter-spacing:3px;color:#00e5ff;font-weight:700;margin-bottom:10px}
h1{font-family:'Bebas Neue',sans-serif;font-size:3rem;letter-spacing:2px;color:#fff;margin-bottom:6px}
.date{font-size:.78rem;color:#4a7a9b;margin-bottom:40px}
.section{margin-bottom:32px;padding:24px;background:rgba(6,32,64,0.4);border:1px solid rgba(0,229,255,0.08);border-radius:16px}
.section h2{font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:#fff;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.section h2 span{font-size:1rem}
.section p{color:#4a7a9b;font-size:.88rem;line-height:1.8}
.section p + p{margin-top:10px}
.highlight{color:#c8f0ff}
.footer{text-align:center;padding-top:40px;border-top:1px solid rgba(0,229,255,0.07);font-size:.78rem;color:#4a7a9b}
.footer a{color:#00e5ff;text-decoration:none}
@media(max-width:600px){.topbar{padding:14px 20px}.wrap{padding:40px 16px 60px}h1{font-size:2.2rem}}
</style>
</head>
<body>
<div class="topbar">
  <a class="logo" href="/"><div class="lm"></div>AQUALINK</a>
  <a class="back" href="/">← Back to Platform</a>
</div>
<div class="wrap">
  <div class="tag">Legal</div>
  <h1>${title}</h1>
  <p class="date">Last updated: May 2026 &nbsp;|&nbsp; AquaLink Global</p>
  ${content}
  <div class="footer">
    <p>Questions? Email us at <a href="mailto:aqualink79@gmail.com">aqualink79@gmail.com</a> — we respond within 48 hours.</p>
    <p style="margin-top:8px">© 2026 AquaLink Global. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}

var PRIVACY_CONTENT = `
  <div class="section"><h2><span>📋</span> 1. Information We Collect</h2><p>We collect your name, email address, organization name, country, and payment details when you register on AquaLink. We also collect booking data, delivery records, and platform interaction history.</p></div>
  <div class="section"><h2><span>🎯</span> 2. How We Use Your Information</h2><p>Your information is used to process and manage water bookings, send booking confirmations and delivery updates, match you with verified water suppliers, process payments securely, and improve our platform and services.</p></div>
  <div class="section"><h2><span>💳</span> 3. Payment Information</h2><p>All payments are processed securely through <span class="highlight">Paystack</span>. AquaLink does not store your full card details on our servers. All payment data is encrypted and handled in accordance with PCI DSS standards.</p></div>
  <div class="section"><h2><span>🤝</span> 4. Data Sharing</h2><p>We do not sell your personal data to third parties. We share your information only with: assigned water suppliers (name and delivery destination only), our payment processor (Paystack), and regulatory or law enforcement authorities when required by law.</p></div>
  <div class="section"><h2><span>🔒</span> 5. Data Security</h2><p>We implement industry-standard security measures including encrypted data transmission (HTTPS), hashed password storage, and access-controlled databases to protect your information.</p></div>
  <div class="section"><h2><span>✅</span> 6. Your Rights</h2><p>You may access, correct, or request deletion of your personal data at any time by contacting us at <span class="highlight">aqualink79@gmail.com</span>. We will respond to all requests within 48 hours.</p></div>
`;

var TERMS_CONTENT = `
  <div class="section"><h2><span>📜</span> 1. Acceptance of Terms</h2><p>By accessing or using AquaLink, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.</p></div>
  <div class="section"><h2><span>💧</span> 2. Platform Description</h2><p>AquaLink is an online marketplace that connects water suppliers with consumers including NGOs, governments, and communities. We facilitate bookings and payment collection on behalf of vendors, but the fulfilment and physical delivery of water is the responsibility of the assigned supplier.</p></div>
  <div class="section"><h2><span>👤</span> 3. User Responsibilities</h2><p>Users agree to provide accurate registration and delivery information, ensure delivery locations are accessible at the agreed time, and pay for bookings in full before dispatch. Misuse of the platform, including fraudulent bookings, may result in account suspension.</p></div>
  <div class="section"><h2><span>🚚</span> 4. Supplier Responsibilities</h2><p>Verified suppliers agree to deliver water as specified in the booking — correct volume, water type, and destination. Suppliers must maintain quality standards. Failure to fulfil confirmed orders may result in removal from the platform and withholding of payment.</p></div>
  <div class="section"><h2><span>💰</span> 5. Payments & Fees</h2><p>All payments are collected by AquaLink via Paystack on behalf of the water vendor. AquaLink charges a <span class="highlight">15% platform fee</span> on each transaction. Suppliers receive <span class="highlight">85% of the order value</span>, disbursed within 48 hours of confirmed delivery. No funds are stored permanently on the platform — there are no user or vendor wallets.</p></div>
  <div class="section"><h2><span>❌</span> 6. Cancellations</h2><p>Cancellations are free before a supplier has been assigned to your booking. After supplier assignment, a cancellation fee may apply. Emergency bookings cannot be cancelled once the supplier has been dispatched. To cancel, email aqualink79@gmail.com with your Booking ID.</p></div>
  <div class="section"><h2><span>⚖️</span> 7. Limitation of Liability</h2><p>AquaLink acts as an intermediary marketplace. We are not liable for delays or quality issues caused by the supplier, force majeure events, or circumstances beyond our reasonable control. Our total liability shall not exceed the amount paid for the specific booking in question.</p></div>
  <div class="section"><h2><span>📧</span> 8. Contact</h2><p>For any questions regarding these terms, contact us at <span class="highlight">aqualink79@gmail.com</span>.</p></div>
`;

var REFUND_CONTENT = `
  <div class="section"><h2><span>✅</span> Full Refund</h2><p>You are entitled to a full refund in the following circumstances:</p><p>• Your booking is cancelled before a supplier has been assigned.<br>• No verified supplier is available for your location or volume requirement.<br>• Delivery is not completed within 48 hours of the agreed date for Emergency-priority orders.<br>• The booking was made in error and reported within 1 hour of placement.</p></div>
  <div class="section"><h2><span>⚠️</span> Partial Refund</h2><p>A partial refund may be issued in the following cases:</p><p>• The volume of water delivered is less than the volume booked and paid for.<br>• The water quality does not meet the agreed standard (potable, agricultural, etc.), verified by our team.<br>In these cases, a refund proportional to the undelivered or substandard portion will be processed.</p></div>
  <div class="section"><h2><span>❌</span> No Refund</h2><p>No refund will be issued if:</p><p>• Delivery was completed as specified in the booking.<br>• The recipient was unavailable at the delivery location at the agreed time.<br>• Incorrect delivery information was provided by the customer.<br>• The cancellation request is made after the supplier has been dispatched for Standard or Urgent bookings.</p></div>
  <div class="section"><h2><span>🔄</span> Disputes Between Buyers and Vendors</h2><p>If a dispute arises between a buyer and a supplier, AquaLink will act as the intermediary. Funds held by the platform will not be disbursed to the supplier until the dispute is resolved. To raise a dispute, email <span class="highlight">aqualink79@gmail.com</span> with your Booking ID and a description of the issue within <span class="highlight">48 hours</span> of the scheduled delivery date.</p></div>
  <div class="section"><h2><span>⏱️</span> How to Request a Refund</h2><p>Email <span class="highlight">aqualink79@gmail.com</span> with your Booking ID and the reason for your refund request. Approved refunds are processed within <span class="highlight">5–7 business days</span> back to your original payment method.</p></div>
`;

var SHIPPING_CONTENT = `
  <div class="section"><h2><span>🚚</span> How Delivery Works</h2><p>AquaLink is an online marketplace — we are not a fulfilment centre. Water products are delivered directly from the assigned third-party vendor (water supplier) to the customer's specified delivery location. AquaLink coordinates and tracks the delivery but does not physically handle the water.</p></div>
  <div class="section"><h2><span>📍</span> Delivery Areas</h2><p>AquaLink currently serves customers across Africa, Asia, the Middle East, and South America. Available delivery areas depend on the verified suppliers in our network. If no supplier is available in your region, you will be notified and a full refund will be issued.</p></div>
  <div class="section"><h2><span>⏰</span> Delivery Timeframes</h2><p>Estimated delivery times are based on the priority level selected at booking:</p><p>• <span class="highlight">Emergency</span> — 24 to 48 hours after payment confirmation.<br>• <span class="highlight">Urgent</span> — 2 to 4 business days after payment confirmation.<br>• <span class="highlight">Standard</span> — 7 to 14 business days after payment confirmation.</p><p>Timeframes are estimates and may vary depending on supplier availability and location accessibility.</p></div>
  <div class="section"><h2><span>💳</span> Shipping Costs</h2><p>Delivery costs are included in the booking price displayed at checkout. There are no hidden delivery fees. The price you pay is the total amount — AquaLink retains a 15% platform fee and disburses 85% to the supplier upon confirmed delivery.</p></div>
  <div class="section"><h2><span>📦</span> Order Tracking</h2><p>Once your booking is confirmed and paid, you can track its status in real time from your AquaLink dashboard. Status updates include: Pending, Active (supplier assigned), In Transit, and Completed.</p></div>
  <div class="section"><h2><span>📧</span> Delivery Issues</h2><p>If your delivery has not arrived within the estimated timeframe, contact us immediately at <span class="highlight">aqualink79@gmail.com</span> with your Booking ID. We will investigate and resolve the issue within 24 hours, including issuing a refund where applicable under our Refund Policy.</p></div>
`;

// ── HTML APP ──────────────────────────────────────────
var APP = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AquaLink - Global Water Distribution</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#010b14;--navy:#062040;--sky:#1578c8;--glow:#00e5ff;--ice:#c8f0ff;--gold:#ffd166;--coral:#ff6b6b;--green:#06d6a0;--muted:#4a7a9b;--foam:#38b6ff}
body{font-family:'Outfit',sans-serif;background:var(--ink);color:var(--ice);min-height:100vh}
.land-nav{position:fixed;top:0;left:0;right:0;z-index:200;padding:16px 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(1,11,20,0.9);backdrop-filter:blur(20px);border-bottom:1px solid rgba(0,229,255,0.08)}
.logo{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;letter-spacing:3px;color:#fff;display:flex;align-items:center;gap:10px}
.lm{width:28px;height:28px;background:linear-gradient(135deg,var(--sky),var(--glow));clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);animation:spin 8s linear infinite;box-shadow:0 0 16px rgba(0,229,255,0.3)}
@keyframes spin{to{transform:rotate(360deg)}}
.land-links{display:flex;gap:24px;align-items:center}
.land-links a{color:rgba(200,240,255,0.6);text-decoration:none;font-size:.85rem;font-weight:500;transition:color .2s;cursor:pointer}
.land-links a:hover{color:var(--glow)}
.land-btns{display:flex;gap:10px}
.btn-outline{padding:9px 20px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.3);color:var(--ice);background:transparent;font-family:'Outfit',sans-serif;font-weight:600;font-size:.83rem;cursor:pointer;transition:all .2s}
.btn-outline:hover{border-color:var(--glow);color:var(--glow)}
.btn-solid{padding:9px 20px;border-radius:100px;background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink);border:none;font-family:'Outfit',sans-serif;font-weight:700;font-size:.83rem;cursor:pointer;transition:all .2s}
.btn-solid:hover{transform:scale(1.05);box-shadow:0 6px 20px rgba(0,229,255,0.3)}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:120px 40px 80px;background:radial-gradient(ellipse at 50% 40%,rgba(21,120,200,0.12),transparent 70%)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:100px;padding:7px 18px;font-size:.72rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--glow);margin-bottom:28px}
.ldot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
.hero h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(4rem,10vw,9rem);line-height:.92;letter-spacing:4px;color:#fff;margin-bottom:16px}
.stroke{-webkit-text-stroke:2px var(--glow);color:transparent}
.filled{background:linear-gradient(180deg,#fff,var(--foam));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{font-size:1rem;color:rgba(200,240,255,0.65);max-width:540px;line-height:1.8;margin:0 auto 40px;font-weight:300}
.hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn-hp{padding:15px 36px;border-radius:100px;background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink);border:none;font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:2px;cursor:pointer;transition:all .2s;box-shadow:0 8px 28px rgba(0,229,255,0.25)}
.btn-hp:hover{transform:translateY(-3px);box-shadow:0 14px 40px rgba(0,229,255,0.4)}
.btn-hg{padding:15px 36px;border-radius:100px;border:1.5px solid rgba(0,229,255,0.3);color:var(--ice);background:transparent;font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:2px;cursor:pointer;transition:all .2s}
.btn-hg:hover{border-color:var(--glow);color:var(--glow);transform:translateY(-3px)}
.stats-strip{background:rgba(6,32,64,0.7);border-top:1px solid rgba(0,229,255,0.08);border-bottom:1px solid rgba(0,229,255,0.08);padding:40px 60px;display:grid;grid-template-columns:repeat(4,1fr)}
.si{text-align:center;position:relative}
.si+.si::before{content:'';position:absolute;left:0;top:20%;bottom:20%;width:1px;background:rgba(0,229,255,0.1)}
.sn{font-family:'Bebas Neue',sans-serif;font-size:3rem;letter-spacing:2px;background:linear-gradient(135deg,var(--foam),var(--glow));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1}
.sl{font-size:.7rem;text-transform:uppercase;letter-spacing:2px;color:var(--muted);margin-top:6px}
.section{padding:80px 60px;max-width:1200px;margin:0 auto}
.sec-tag{font-size:.7rem;text-transform:uppercase;letter-spacing:3px;color:var(--glow);font-weight:700;margin-bottom:12px}
.sec-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(2.5rem,5vw,4rem);letter-spacing:2px;color:#fff;line-height:1;margin-bottom:16px}
.sec-title em{font-style:normal;-webkit-text-stroke:1.5px var(--glow);color:transparent}
.sec-sub{color:var(--muted);font-size:.95rem;line-height:1.8;max-width:480px;font-weight:300}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:48px}
.card-box{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:20px;padding:28px;transition:all .25s;cursor:pointer}
.card-box:hover{transform:translateY(-6px);border-color:rgba(0,229,255,0.25);box-shadow:0 20px 50px rgba(0,0,0,0.3)}
.card-icon{font-size:2.2rem;margin-bottom:14px}
.card-box h4{font-family:'Bebas Neue',sans-serif;font-size:1.2rem;letter-spacing:1.5px;color:#fff;margin-bottom:8px}
.card-box p{font-size:.85rem;color:var(--muted);line-height:1.7;margin-bottom:16px}
.card-link{font-size:.82rem;color:var(--glow);font-weight:600;background:none;border:1.5px solid rgba(0,229,255,0.25);border-radius:100px;padding:7px 16px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s}
.card-link:hover{background:rgba(0,229,255,0.08);border-color:var(--glow)}
.about-sec{background:rgba(6,32,64,0.2);border-top:1px solid rgba(0,229,255,0.08);padding:80px 60px}
.about-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
.about-stats{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.astat{background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.12);border-radius:16px;padding:24px;text-align:center}
.astat-num{font-family:'Bebas Neue',sans-serif;font-size:2.2rem;background:linear-gradient(135deg,var(--foam),var(--glow));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.astat-label{font-size:.78rem;color:var(--muted);margin-top:4px}
.sup-cta-sec{background:rgba(6,32,64,0.3);border-top:1px solid rgba(0,229,255,0.08);padding:80px 60px}
.sup-cta-inner{max-width:1200px;margin:0 auto}
.sup-cta-box{background:linear-gradient(135deg,rgba(10,74,124,0.5),rgba(6,32,64,0.8));border:1px solid rgba(0,229,255,0.15);border-radius:24px;padding:44px;display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;margin-top:36px}
.sup-cta-box h3{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:2px;color:#fff;margin-bottom:8px}
.sup-cta-box p{color:var(--muted);font-size:.88rem;line-height:1.7;max-width:480px}
.sup-perks{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}
.sup-perks span{font-size:.82rem;color:var(--green)}
.contact-sec{padding:80px 60px}
.contact-inner{max-width:900px;margin:0 auto}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start;margin-top:40px}
.contact-info{display:flex;flex-direction:column;gap:20px}
.cinfo-item{display:flex;gap:14px;align-items:flex-start}
.cinfo-ico{width:42px;height:42px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}
.cinfo-title{font-weight:600;color:var(--ice);font-size:.9rem;margin-bottom:3px}
.cinfo-text{color:var(--muted);font-size:.82rem}
.contact-form{background:rgba(6,32,64,0.6);border:1px solid rgba(0,229,255,0.15);border-radius:20px;padding:28px}
.contact-form h3{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:2px;color:#fff;margin-bottom:18px}
.finp{width:100%;padding:12px 15px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:.88rem;outline:none;margin-bottom:12px;transition:border-color .2s}
.finp:focus{border-color:var(--glow)}
.finp option{background:#021525}
textarea.finp{resize:vertical;min-height:80px}
.c-result{font-size:.82rem;margin-bottom:12px;display:none}
.cbtn{width:100%;padding:13px;background:linear-gradient(135deg,var(--sky),var(--glow));border:none;border-radius:14px;color:var(--ink);font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;transition:all .2s}
.cbtn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,229,255,0.3)}
.footer{background:rgba(2,12,24,0.9);border-top:1px solid rgba(0,229,255,0.07);padding:48px 60px 28px}
.footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px;max-width:1200px;margin:0 auto 40px}
.footer-brand p{color:var(--muted);font-size:.82rem;line-height:1.8;margin-top:12px;max-width:260px}
.footer-col h6{font-family:'Bebas Neue',sans-serif;font-size:.95rem;letter-spacing:2px;color:#fff;margin-bottom:14px}
.footer-col a{display:block;color:var(--muted);text-decoration:none;font-size:.82rem;margin-bottom:10px;transition:color .2s;cursor:pointer}
.footer-col a:hover{color:var(--glow)}
.footer-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:24px;border-top:1px solid rgba(0,229,255,0.06);max-width:1200px;margin:0 auto;flex-wrap:wrap;gap:10px}
.footer-bottom p{font-size:.76rem;color:var(--muted)}
.overlay{position:fixed;inset:0;background:rgba(1,11,20,0.92);backdrop-filter:blur(14px);z-index:500;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .3s;padding:20px}
.overlay.open{opacity:1;pointer-events:all}
.mbox{background:linear-gradient(135deg,rgba(6,32,64,0.97),rgba(2,21,37,0.99));border:1px solid rgba(0,229,255,0.2);border-radius:24px;padding:36px;width:100%;max-width:480px;transform:scale(.95) translateY(16px);transition:transform .3s;position:relative;box-shadow:0 40px 80px rgba(0,0,0,0.6);max-height:90vh;overflow-y:auto}
.overlay.open .mbox{transform:scale(1) translateY(0)}
.mclose{position:absolute;top:14px;right:18px;background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer}
.mclose:hover{color:#fff}
.mtabs{display:flex;background:rgba(1,11,20,0.5);border-radius:12px;padding:4px;margin-bottom:22px}
.mtab{flex:1;padding:9px;text-align:center;border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;color:var(--muted);transition:all .2s}
.mtab.on{background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink)}
.mh2{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;letter-spacing:2px;color:#fff;margin-bottom:4px}
.msub{color:var(--muted);font-size:.83rem;margin-bottom:18px}
.mlabel{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;margin-bottom:6px}
.minp{width:100%;padding:11px 14px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.18);border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:.88rem;outline:none;margin-bottom:12px;transition:border-color .2s}
.minp:focus{border-color:var(--glow)}
.minp option{background:#021525}
.m2col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.merr{background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);border-radius:10px;padding:9px 13px;color:var(--coral);font-size:.8rem;margin-bottom:12px;display:none}
.mok{background:rgba(6,214,160,0.1);border:1px solid rgba(6,214,160,0.2);border-radius:10px;padding:9px 13px;color:var(--green);font-size:.8rem;margin-bottom:12px;display:none}
.mbtn{width:100%;padding:13px;background:linear-gradient(135deg,var(--sky),var(--glow));border:none;border-radius:14px;color:var(--ink);font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;transition:all .2s;margin-top:4px}
.mbtn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,229,255,0.3)}
.mbtn:disabled{opacity:.5;transform:none}
.mhint{text-align:center;font-size:.74rem;color:var(--muted);margin-top:10px}
.type-sel{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.type-card{padding:16px;border:1.5px solid rgba(0,229,255,0.15);border-radius:14px;cursor:pointer;text-align:center;transition:all .2s}
.type-card:hover,.type-card.sel{border-color:var(--glow);background:rgba(0,229,255,0.07)}
.type-card .tico{font-size:1.8rem;margin-bottom:6px}
.type-card h5{font-family:'Bebas Neue',sans-serif;font-size:.95rem;letter-spacing:1.5px;color:#fff;margin-bottom:3px}
.type-card p{font-size:.72rem;color:var(--muted);line-height:1.4}
#app{display:none}
.topbar{background:rgba(1,11,20,0.96);border-bottom:1px solid rgba(0,229,255,0.1);padding:13px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;backdrop-filter:blur(20px);flex-wrap:wrap;gap:8px}
.tlogo{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:3px;display:flex;align-items:center;gap:8px;cursor:pointer}
.tnav{display:flex;gap:6px;flex-wrap:wrap}
.nb{padding:7px 14px;border-radius:100px;font-size:.8rem;font-weight:600;cursor:pointer;border:1.5px solid rgba(0,229,255,0.18);color:var(--muted);background:transparent;font-family:'Outfit',sans-serif;transition:all .2s}
.nb:hover,.nb.on{border-color:var(--glow);color:var(--glow);background:rgba(0,229,255,0.07)}
.tuser{display:flex;align-items:center;gap:8px}
.tav{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--sky),var(--glow));display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:.88rem;color:var(--ink)}
.tuname{font-size:.82rem;font-weight:600}
.turole{font-size:.7rem;color:var(--muted);background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.15);border-radius:100px;padding:2px 8px}
.tlout{padding:6px 14px;border-radius:100px;border:1px solid rgba(255,107,107,0.3);color:var(--coral);background:transparent;font-size:.76rem;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s}
.tlout:hover{background:rgba(255,107,107,0.1)}
.page{display:none;padding:28px;max-width:1100px;margin:0 auto}
.page.on{display:block}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:2px;color:#fff;margin-bottom:5px}
.psub{color:var(--muted);font-size:.86rem;margin-bottom:22px}
.dcards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
.dcard{background:rgba(6,32,64,0.7);border:1px solid rgba(0,229,255,0.12);border-radius:14px;padding:18px;transition:transform .2s}
.dcard:hover{transform:translateY(-3px)}
.dcard-label{font-size:.66rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;margin-bottom:7px}
.dcard-val{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:1px;color:#fff;line-height:1}
.dcard-tag{font-size:.7rem;color:var(--green);margin-top:5px}
.panel{background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.1);border-radius:14px;padding:22px;margin-bottom:18px}
.ptit{font-family:'Bebas Neue',sans-serif;font-size:1.05rem;letter-spacing:1.5px;color:#fff;margin-bottom:14px}
.tscroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;padding:9px 12px;font-size:.65rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600;border-bottom:1px solid rgba(0,229,255,0.08)}
td{padding:11px 12px;color:var(--ice);border-bottom:1px solid rgba(0,229,255,0.04)}
tr:hover td{background:rgba(0,229,255,0.03)}
.bid{font-family:'Bebas Neue',sans-serif;font-size:.9rem;letter-spacing:1px;color:var(--glow)}
.badge{display:inline-block;padding:3px 9px;border-radius:100px;font-size:.67rem;font-weight:700}
.b-active{background:rgba(6,214,160,0.12);color:var(--green);border:1px solid rgba(6,214,160,0.2)}
.b-pending{background:rgba(255,209,102,0.1);color:var(--gold);border:1px solid rgba(255,209,102,0.2)}
.b-transit{background:rgba(0,229,255,0.1);color:var(--glow);border:1px solid rgba(0,229,255,0.2)}
.b-complete{background:rgba(74,122,155,0.15);color:var(--muted);border:1px solid rgba(74,122,155,0.2)}
.b-crit{background:rgba(255,107,107,0.12);color:var(--coral);border:1px solid rgba(255,107,107,0.2)}
.b-supplier{background:rgba(0,229,255,0.1);color:var(--foam);border:1px solid rgba(0,229,255,0.2)}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.fg label{font-size:.68rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600}
.fg input,.fg select,.fg textarea{padding:11px 14px;background:rgba(1,11,20,0.8);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:.86rem;outline:none;transition:border-color .2s}
.fg input:focus,.fg select:focus{border-color:var(--glow)}
.fg select option{background:#021525}
.fg textarea{resize:vertical;min-height:64px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.full{grid-column:1/-1}
.btn{padding:10px 22px;border-radius:100px;font-family:'Outfit',sans-serif;font-weight:700;font-size:.85rem;cursor:pointer;border:none;transition:all .2s}
.btn-p{background:linear-gradient(135deg,var(--sky),var(--glow));color:var(--ink)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,229,255,0.3)}
.btn-p:disabled{opacity:.5;transform:none}
.btn-g{background:transparent;border:1.5px solid rgba(0,229,255,0.25);color:var(--ice)}
.btn-g:hover{border-color:var(--glow);color:var(--glow)}
.btn-d{background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.25);color:var(--coral);font-size:.76rem;padding:5px 11px}
.btn-d:hover{background:rgba(255,107,107,0.2)}
.btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
.ssel{padding:5px 10px;background:rgba(1,11,20,0.8);border:1px solid rgba(0,229,255,0.15);border-radius:8px;color:#fff;font-size:.76rem;cursor:pointer;outline:none}
.ssel option{background:#021525}
.frow{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.frow input,.frow select{padding:8px 12px;background:rgba(1,11,20,0.7);border:1.5px solid rgba(0,229,255,0.15);border-radius:12px;color:#fff;font-size:.82rem;outline:none;font-family:'Outfit',sans-serif}
.frow select option{background:#021525}
.empty{text-align:center;padding:36px;color:var(--muted)}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{padding:7px 14px;border-radius:100px;font-size:.78rem;font-weight:600;border:1.5px solid rgba(0,229,255,0.18);color:var(--muted);background:transparent;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s}
.pill.on,.pill:hover{border-color:var(--glow);color:var(--glow);background:rgba(0,229,255,0.08)}
.vol-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.vol-lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600}
.vol-val{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:1px;color:var(--glow)}
input[type=range]{width:100%;height:5px;-webkit-appearance:none;background:rgba(0,229,255,0.12);border-radius:100px;outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,var(--sky),var(--glow));cursor:pointer}
.success-wrap{text-align:center;padding:32px 16px}
.success-wrap .big{font-size:3rem;margin-bottom:12px}
.success-wrap h3{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;color:var(--green);letter-spacing:2px;margin-bottom:7px}
.id-chip{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:2px;color:var(--glow);background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:10px;padding:9px 16px;margin:12px 0;display:inline-block}
.pay-box{margin-top:18px;padding:18px;background:rgba(6,32,64,0.5);border:1px solid rgba(0,229,255,0.2);border-radius:14px}
.info-banner{background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.15);border-radius:12px;padding:12px 16px;color:var(--ice);font-size:.83rem;margin-bottom:18px;line-height:1.6}
.bar-item{margin-bottom:12px}
.bar-head{display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px}
.bar-track{height:5px;background:rgba(0,229,255,0.08);border-radius:100px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--sky),var(--glow));border-radius:100px}
.toast{position:fixed;bottom:22px;right:22px;z-index:9999;background:rgba(6,32,64,0.97);border:1px solid rgba(0,229,255,0.3);border-radius:14px;padding:12px 18px;display:flex;align-items:center;gap:9px;transform:translateY(70px);opacity:0;transition:all .4s;backdrop-filter:blur(14px);font-size:.85rem;color:var(--ice);max-width:320px}
.toast.show{transform:translateY(0);opacity:1}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(1,11,20,0.3);border-top-color:var(--ink);border-radius:50%;animation:rot .6s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes rot{to{transform:rotate(360deg)}}
@media(max-width:768px){
  .land-nav{padding:12px 20px}.land-links{display:none}
  .stats-strip{grid-template-columns:1fr 1fr;gap:20px;padding:32px 20px}
  .grid3{grid-template-columns:1fr}
  .about-inner,.contact-grid{grid-template-columns:1fr}
  .about-sec,.sup-cta-sec,.contact-sec,.section{padding:60px 24px}
  .footer{padding:40px 24px 24px}.footer-grid{grid-template-columns:1fr 1fr}
  .dcards{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}
  .m2col,.type-sel{grid-template-columns:1fr}.page{padding:16px}
}
</style>
</head>
<body>
<div id="landing">
  <nav class="land-nav">
    <div class="logo"><div class="lm"></div>AQUALINK</div>
    <div class="land-links">
      <a href="#how">How It Works</a><a href="#who">Who It's For</a>
      <a href="#suppliers">Become a Supplier</a><a href="#about">About Us</a><a href="#contact">Contact</a>
    </div>
    <div class="land-btns">
      <button class="btn-outline" onclick="openAuth('login')">Login</button>
      <button class="btn-solid"   onclick="openAuth('register')">Get Started</button>
    </div>
  </nav>
  <div class="hero">
    <div class="hero-badge"><span class="ldot"></span>Platform Live — Join Today</div>
    <h1><div class="filled">WATER</div><div class="stroke">FOR ALL</div></h1>
    <p>AquaLink connects water suppliers, NGOs, governments, and communities — making clean water accessible anywhere in the world through smart booking and distribution technology.</p>
    <div class="hero-btns">
      <button class="btn-hp" onclick="openAuth('register','consumer')">Book Water Now</button>
      <button class="btn-hg" onclick="openAuth('register','supplier')">Become a Supplier</button>
    </div>
  </div>
  <div class="stats-strip">
    <div class="si"><div class="sn" id="ls-bookings">0</div><div class="sl">Bookings Made</div></div>
    <div class="si"><div class="sn" id="ls-users">0</div><div class="sl">Registered Users</div></div>
    <div class="si"><div class="sn" id="ls-litres">0</div><div class="sl">Litres Requested</div></div>
    <div class="si"><div class="sn" id="ls-suppliers">0</div><div class="sl">Verified Suppliers</div></div>
  </div>
  <div class="section" id="how">
    <div class="sec-tag">Simple Process</div>
    <h2 class="sec-title">HOW AQUALINK <em>WORKS</em></h2>
    <p class="sec-sub">Three simple steps to get clean water delivered anywhere in the world.</p>
    <div class="grid3">
      <div class="card-box"><div class="card-icon">📝</div><h4>REGISTER YOUR ACCOUNT</h4><p>Sign up as a Consumer or Water Supplier. Verification takes under 24 hours.</p></div>
      <div class="card-box"><div class="card-icon">💧</div><h4>SUBMIT A BOOKING</h4><p>Tell us your location, volume, water type and urgency. We match you to the nearest verified supplier.</p></div>
      <div class="card-box"><div class="card-icon">🚚</div><h4>RECEIVE YOUR WATER</h4><p>Our team coordinates with your matched supplier and keeps you updated until delivery is confirmed.</p></div>
    </div>
  </div>
  <div class="section" id="who" style="padding-top:0">
    <div class="sec-tag">For Everyone</div>
    <h2 class="sec-title">WHO CAN USE <em>AQUALINK</em></h2>
    <p class="sec-sub">Whether you need water or supply it — AquaLink is built for you.</p>
    <div class="grid3">
      <div class="card-box"><div class="card-icon">🏛️</div><h4>GOVERNMENTS</h4><p>Manage national water distribution, respond to crises, and coordinate emergency relief at scale.</p><button class="card-link" onclick="openAuth('register','consumer')">Register as Government →</button></div>
      <div class="card-box"><div class="card-icon">🌍</div><h4>NGOs & AID ORGS</h4><p>Book emergency water supplies for affected communities with priority processing for humanitarian organizations.</p><button class="card-link" onclick="openAuth('register','consumer')">Register as NGO →</button></div>
      <div class="card-box"><div class="card-icon">👥</div><h4>COMMUNITIES</h4><p>Individual families and communities can book potable water for drinking, sanitation, or agricultural use.</p><button class="card-link" onclick="openAuth('register','consumer')">Register as Community →</button></div>
    </div>
  </div>
  <div class="sup-cta-sec" id="suppliers">
    <div class="sup-cta-inner">
      <div class="sec-tag">Water Suppliers</div>
      <h2 class="sec-title">ARE YOU A WATER <em>SUPPLIER?</em></h2>
      <p class="sec-sub">Join AquaLink's verified supplier network and connect your water supply to millions who need it.</p>
      <div class="sup-cta-box">
        <div>
          <h3>JOIN AS A VERIFIED SUPPLIER</h3>
          <p>Water companies, tanker operators, treatment plants and distributors — list your capacity and receive booking requests from NGOs, governments and communities in your region.</p>
          <div class="sup-perks"><span>✅ Free to list</span><span>✅ Receive booking requests</span><span>✅ Expand your customer base</span><span>✅ Verified supplier badge</span><span>✅ Earn 85% of order value</span></div>
        </div>
        <button class="btn-hp" onclick="openAuth('register','supplier')">APPLY AS SUPPLIER →</button>
      </div>
    </div>
  </div>
  <div class="about-sec" id="about">
    <div class="about-inner">
      <div>
        <div class="sec-tag">About AquaLink</div>
        <h2 class="sec-title">WE BELIEVE WATER IS A <em>HUMAN RIGHT</em></h2>
        <p class="sec-sub" style="margin-bottom:16px">AquaLink was built on one belief — no person on Earth should die from lack of access to clean water. We are building the technology infrastructure to make that a reality.</p>
        <p class="sec-sub" style="margin-bottom:16px">We connect water suppliers, NGOs, governments, and communities through a single intelligent platform — making water distribution faster, more transparent, and more accountable.</p>
        <p class="sec-sub">Every booking is tracked, every payment is verified, and every delivery is confirmed. Full transparency from source to destination.</p>
      </div>
      <div class="about-stats">
        <div class="astat"><div class="astat-num">100%</div><div class="astat-label">Transparent Transactions</div></div>
        <div class="astat"><div class="astat-num">24/7</div><div class="astat-label">Platform Available</div></div>
        <div class="astat"><div class="astat-num">48H</div><div class="astat-label">Emergency Response</div></div>
        <div class="astat"><div class="astat-num">🌍</div><div class="astat-label">Global Coverage</div></div>
      </div>
    </div>
  </div>
  <div class="contact-sec" id="contact">
    <div class="contact-inner">
      <div class="sec-tag">Get In Touch</div>
      <h2 class="sec-title">CONTACT <em>US</em></h2>
      <p class="sec-sub">Questions about AquaLink? Want to partner with us? We reply within 24 hours.</p>
      <div class="contact-grid">
        <div class="contact-info">
          <div class="cinfo-item"><div class="cinfo-ico">📧</div><div><div class="cinfo-title">Email Us</div><div class="cinfo-text">aqualink79@gmail.com<br>We reply within 24 hours</div></div></div>
          <div class="cinfo-item"><div class="cinfo-ico">🌍</div><div><div class="cinfo-title">Headquarters</div><div class="cinfo-text">Nigeria, West Africa<br>Serving globally</div></div></div>
          <div class="cinfo-item"><div class="cinfo-ico">🤝</div><div><div class="cinfo-title">Partnerships</div><div class="cinfo-text">Open to NGOs, governments<br>and water suppliers</div></div></div>
        </div>
        <div class="contact-form">
          <h3>SEND US A MESSAGE</h3>
          <input class="finp" id="c-name" type="text" placeholder="Your Name">
          <input class="finp" id="c-email" type="email" placeholder="Your Email">
          <select class="finp" id="c-subj"><option>I want to book water</option><option>I want to become a supplier</option><option>Partnership inquiry</option><option>Technical support</option><option>General question</option></select>
          <textarea class="finp" id="c-msg" placeholder="Your message..."></textarea>
          <div class="c-result" id="c-result"></div>
          <button class="cbtn" onclick="sendContact()">SEND MESSAGE →</button>
        </div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="logo"><div class="lm" style="width:22px;height:22px"></div>AQUALINK</div>
        <p>A global platform for equitable water distribution. Every community deserves access to clean, safe water.</p>
      </div>
      <div class="footer-col"><h6>Platform</h6><a onclick="openAuth('login')">Login</a><a onclick="openAuth('register','consumer')">Book Water</a><a onclick="openAuth('register','supplier')">Become Supplier</a></div>
      <div class="footer-col"><h6>Company</h6><a href="#about">About Us</a><a href="#contact">Contact</a><a href="#who">Who We Serve</a></div>
      <div class="footer-col">
        <h6>Legal</h6>
        <a href="/privacy" target="_blank">Privacy Policy</a>
        <a href="/terms" target="_blank">Terms of Service</a>
        <a href="/refund" target="_blank">Refund Policy</a>
        <a href="/shipping" target="_blank">Shipping Policy</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 AquaLink Global. All rights reserved.</p>
      <p style="color:var(--green);font-size:.76rem">💧 Clean water for everyone</p>
    </div>
  </div>
</div>

<div class="overlay" id="auth-overlay" onclick="closeOverlay(event)">
  <div class="mbox">
    <button class="mclose" onclick="closeAuth()">✕</button>
    <div class="mtabs">
      <div class="mtab on" onclick="switchTab('login',this)">Login</div>
      <div class="mtab"    onclick="switchTab('register',this)">Register</div>
    </div>
    <div id="merr" class="merr"></div>
    <div id="mok"  class="mok"></div>
    <div id="auth-login">
      <div class="mh2">WELCOME BACK</div>
      <p class="msub">Sign in to your AquaLink account</p>
      <label class="mlabel">Email Address</label>
      <input class="minp" id="l-email" type="email" placeholder="your@email.com">
      <label class="mlabel">Password</label>
      <input class="minp" id="l-pass" type="password" placeholder="Your password" onkeydown="if(event.key==='Enter')doLogin()">
      <button class="mbtn" id="l-btn" onclick="doLogin()">LOGIN →</button>
      <p class="mhint">Demo: admin@aqualink.org / admin123</p>
    </div>
    <div id="auth-register" style="display:none">
      <div class="mh2">JOIN AQUALINK</div>
      <p class="msub">Create your free account</p>
      <div class="type-sel">
        <div class="type-card sel" id="tc-consumer" onclick="selType('consumer')"><div class="tico">💧</div><h5>BOOK WATER</h5><p>I need water for my community or organization</p></div>
        <div class="type-card" id="tc-supplier" onclick="selType('supplier')"><div class="tico">🚚</div><h5>SUPPLY WATER</h5><p>I am a water company wanting to list my services</p></div>
      </div>
      <div class="m2col">
        <div><label class="mlabel">Full Name *</label><input class="minp" id="r-name" type="text" placeholder="Your name"></div>
        <div><label class="mlabel">Email *</label><input class="minp" id="r-email" type="email" placeholder="you@email.com"></div>
      </div>
      <div class="m2col">
        <div><label class="mlabel">Password *</label><input class="minp" id="r-pass" type="password" placeholder="Min 6 chars"></div>
        <div><label class="mlabel">Country *</label><input class="minp" id="r-country" type="text" placeholder="Your country"></div>
      </div>
      <label class="mlabel">Organization / Company</label>
      <input class="minp" id="r-org" type="text" placeholder="Organization or company name">
      <div id="r-sup-extra" style="display:none">
        <label class="mlabel">Water Types You Supply</label>
        <select class="minp" id="r-water-types"><option>Potable / Drinking Water</option><option>Agricultural Water</option><option>Industrial Water</option><option>All Types</option></select>
        <label class="mlabel">Daily Supply Capacity (Litres)</label>
        <input class="minp" id="r-capacity" type="number" placeholder="e.g. 100000">
        <label class="mlabel">Regions You Cover</label>
        <input class="minp" id="r-regions" type="text" placeholder="e.g. Lagos, Abuja, South West Nigeria">
      </div>
      <button class="mbtn" id="r-btn" onclick="doRegister()">CREATE ACCOUNT →</button>
    </div>
  </div>
</div>

<div id="app">
  <div class="topbar">
    <div class="tlogo" onclick="goLanding()"><div class="lm" style="width:22px;height:22px"></div>AQUALINK</div>
    <div class="tnav" id="tnav"></div>
    <div class="tuser">
      <div class="tav" id="tav">A</div>
      <div><div class="tuname" id="tuname"></div><div class="turole" id="turole"></div></div>
      <button class="tlout" onclick="doLogout()">Logout</button>
    </div>
  </div>
  <div class="page" id="pg-admin">
    <div class="ptitle">Admin Control Center</div>
    <p class="psub">Full platform overview — you control everything from here.</p>
    <div class="dcards">
      <div class="dcard"><div class="dcard-label">Total Bookings</div><div class="dcard-val" id="a-bookings">-</div><div class="dcard-tag">All time</div></div>
      <div class="dcard"><div class="dcard-label">Total Users</div><div class="dcard-val" id="a-users">-</div><div class="dcard-tag">Registered</div></div>
      <div class="dcard"><div class="dcard-label">Revenue (NGN)</div><div class="dcard-val" id="a-revenue">-</div><div class="dcard-tag">Collected</div></div>
      <div class="dcard"><div class="dcard-label">Pending Approvals</div><div class="dcard-val" id="a-approvals" style="color:var(--gold)">-</div><div class="dcard-tag">Suppliers waiting</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">
      <div class="dcard" style="text-align:center"><div class="dcard-label">Pending Orders</div><div class="dcard-val" style="color:var(--gold)" id="a-pending">-</div></div>
      <div class="dcard" style="text-align:center"><div class="dcard-label">Active Orders</div><div class="dcard-val" style="color:var(--green)" id="a-active">-</div></div>
      <div class="dcard" style="text-align:center"><div class="dcard-label">In Transit</div><div class="dcard-val" style="color:var(--glow)" id="a-transit">-</div></div>
      <div class="dcard" style="text-align:center"><div class="dcard-label">Completed</div><div class="dcard-val" style="color:var(--muted)" id="a-complete">-</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px">
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div class="ptit" style="margin:0">Recent Bookings</div>
          <button class="btn btn-g" style="padding:5px 12px;font-size:.76rem" onclick="goPage('admin-bookings')">View All →</button>
        </div>
        <div class="tscroll"><table><thead><tr><th>ID</th><th>Destination</th><th>Volume</th><th>Priority</th><th>Status</th><th>Paid</th></tr></thead><tbody id="a-recent"></tbody></table></div>
      </div>
      <div>
        <div class="panel" style="margin-bottom:14px">
          <div class="ptit">Quick Actions</div>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button class="btn btn-p" style="width:100%;padding:11px" onclick="goPage('admin-suppliers')">✅ Approve Suppliers</button>
            <button class="btn btn-g" style="width:100%;padding:11px" onclick="goPage('admin-bookings')">💧 Manage Bookings</button>
            <button class="btn btn-g" style="width:100%;padding:11px" onclick="goPage('admin-users')">👥 View All Users</button>
            <button class="btn btn-g" style="width:100%;padding:11px" onclick="goPage('admin-revenue')">💰 Revenue Report</button>
          </div>
        </div>
        <div class="panel"><div class="ptit">By Status</div><div id="a-status-bars"></div></div>
      </div>
    </div>
  </div>
  <div class="page" id="pg-admin-bookings">
    <div class="ptitle">All Bookings</div><p class="psub">Every water booking across the entire platform.</p>
    <div class="frow">
      <input type="text" id="ab-search" placeholder="Search..." oninput="loadAdminBookings()" style="flex:1;min-width:140px">
      <select id="ab-status" onchange="loadAdminBookings()"><option value="all">All Statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="transit">In Transit</option><option value="complete">Complete</option></select>
      <button class="btn btn-g" style="padding:8px 14px;font-size:.78rem" onclick="loadAdminBookings()">↻</button>
    </div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>ID</th><th>Customer</th><th>Destination</th><th>Volume</th><th>Priority</th><th>Status</th><th>Paid</th><th>Date</th><th>Action</th></tr></thead>
      <tbody id="ab-rows"></tbody>
    </table></div><div id="ab-empty" class="empty" style="display:none">No bookings found.</div></div>
  </div>
  <div class="page" id="pg-admin-suppliers">
    <div class="ptitle">Supplier Management</div><p class="psub">Review and approve water supplier applications.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div class="dcard"><div class="dcard-label">Pending Approval</div><div class="dcard-val" id="sup-pend-count" style="color:var(--gold)">-</div></div>
      <div class="dcard"><div class="dcard-label">Verified Suppliers</div><div class="dcard-val" id="sup-ver-count" style="color:var(--green)">-</div></div>
    </div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>Name</th><th>Organization</th><th>Country</th><th>Water Types</th><th>Coverage</th><th>Status</th><th>Action</th></tr></thead>
      <tbody id="sup-rows"></tbody>
    </table></div><div id="sup-empty" class="empty" style="display:none">No suppliers yet.</div></div>
  </div>
  <div class="page" id="pg-admin-users">
    <div class="ptitle">All Users</div><p class="psub">Every registered account on AquaLink.</p>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Organization</th><th>Country</th><th>Joined</th></tr></thead>
      <tbody id="admin-users-rows"></tbody>
    </table></div></div>
  </div>
  <div class="page" id="pg-admin-revenue">
    <div class="ptitle">Revenue Report</div><p class="psub">All payments collected through AquaLink.</p>
    <div class="dcards">
      <div class="dcard"><div class="dcard-label">Total Collected</div><div class="dcard-val" id="rev-total">-</div><div class="dcard-tag">NGN</div></div>
      <div class="dcard"><div class="dcard-label">Your Commission (15%)</div><div class="dcard-val" id="rev-comm">-</div><div class="dcard-tag">NGN</div></div>
      <div class="dcard"><div class="dcard-label">Supplier Payouts (85%)</div><div class="dcard-val" id="rev-pay">-</div><div class="dcard-tag">NGN</div></div>
      <div class="dcard"><div class="dcard-label">Paid Orders</div><div class="dcard-val" id="rev-count">-</div><div class="dcard-tag">Transactions</div></div>
    </div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>Booking ID</th><th>Customer</th><th>Destination</th><th>Amount (NGN)</th><th>Commission</th><th>Supplier Payout</th><th>Date</th></tr></thead>
      <tbody id="rev-rows"></tbody>
    </table></div><div id="rev-empty" class="empty" style="display:none">No payments yet.</div></div>
  </div>
  <div class="page" id="pg-dashboard">
    <div class="ptitle" id="dash-title">Dashboard</div><p class="psub" id="dash-sub">Welcome! Book clean water for your community.</p>
    <div class="dcards">
      <div class="dcard"><div class="dcard-label">My Bookings</div><div class="dcard-val" id="c-total">-</div><div class="dcard-tag">All time</div></div>
      <div class="dcard"><div class="dcard-label">Pending Orders</div><div class="dcard-val" id="c-pending" style="color:var(--gold)">-</div><div class="dcard-tag">Awaiting delivery</div></div>
      <div class="dcard"><div class="dcard-label">Litres Ordered</div><div class="dcard-val" id="c-litres">-</div><div class="dcard-tag">Total volume</div></div>
      <div class="dcard"><div class="dcard-label">Completed</div><div class="dcard-val" id="c-complete" style="color:var(--green)">-</div><div class="dcard-tag">Delivered</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px">
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div class="ptit" style="margin:0">My Recent Bookings</div>
          <button class="btn btn-g" style="padding:5px 12px;font-size:.76rem" onclick="goPage('bookings')">View All →</button>
        </div>
        <div class="tscroll"><table><thead><tr><th>ID</th><th>Destination</th><th>Volume</th><th>Status</th><th>Paid</th></tr></thead><tbody id="c-recent"></tbody></table></div>
      </div>
      <div class="panel">
        <div class="ptit">Quick Actions</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <button class="btn btn-p" style="width:100%;padding:13px" onclick="goPage('book')">💧 Book Water Now</button>
          <button class="btn btn-g" style="width:100%;padding:11px" onclick="goPage('bookings')">📋 Track My Orders</button>
          <button class="btn btn-g" style="width:100%;padding:11px" onclick="goPage('suppliers')">🚚 View Suppliers</button>
        </div>
        <div style="margin-top:18px;padding:14px;background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.12);border-radius:12px">
          <div style="font-size:.8rem;font-weight:600;color:var(--ice);margin-bottom:5px">Need Help?</div>
          <div style="font-size:.76rem;color:var(--muted)">Email us at<br><a href="mailto:aqualink79@gmail.com" style="color:var(--glow)">aqualink79@gmail.com</a></div>
        </div>
      </div>
    </div>
  </div>
  <div class="page" id="pg-book">
    <div class="ptitle">Book Water Supply</div><p class="psub">Request clean water delivery to your location.</p>
    <div id="book-success" class="success-wrap" style="display:none">
      <div class="big">💧</div><h3>BOOKING CONFIRMED!</h3>
      <div class="id-chip" id="s-id">AQL-XXXXX</div>
      <p id="s-msg" style="color:var(--muted);font-size:.86rem;margin-bottom:16px"></p>
      <div class="pay-box">
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Complete payment to activate your booking</p>
        <div id="pay-amount" style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--glow);letter-spacing:2px;margin-bottom:12px">—</div>
        <button class="btn btn-p" onclick="payNow()" style="width:100%;padding:13px;border-radius:14px">💳 PAY NOW WITH PAYSTACK</button>
        <p style="font-size:.72rem;color:var(--muted);margin-top:8px">Secure. Supports cards, bank transfer and USSD.</p>
      </div>
      <button class="btn btn-g" style="margin-top:12px" onclick="goPage('bookings')">PAY LATER — VIEW BOOKINGS</button>
    </div>
    <div class="panel" id="book-form">
      <div class="form-grid">
        <div class="fg"><label>Destination Country *</label><select id="b-country"><option value="">Select country...</option><option>Nigeria</option><option>Kenya</option><option>Ethiopia</option><option>Somalia</option><option>South Africa</option><option>Ghana</option><option>Egypt</option><option>Sudan</option><option>Niger</option><option>Mali</option><option>Chad</option><option>DR Congo</option><option>India</option><option>Bangladesh</option><option>Pakistan</option><option>Afghanistan</option><option>Yemen</option><option>Syria</option><option>Brazil</option><option>Colombia</option><option>Haiti</option><option>Venezuela</option><option>Indonesia</option><option>Philippines</option><option>Myanmar</option><option>Mexico</option></select></div>
        <div class="fg"><label>City / Region</label><input type="text" id="b-city" placeholder="e.g. Lagos, Kano"></div>
        <div class="fg full"><label>Water Type</label><div class="pills"><button class="pill on" onclick="pp(this)">Potable</button><button class="pill" onclick="pp(this)">Agricultural</button><button class="pill" onclick="pp(this)">Industrial</button><button class="pill" onclick="pp(this)">Emergency</button></div></div>
        <div class="fg full"><div class="vol-row"><span class="vol-lbl">Volume Required</span><span class="vol-val" id="vd">5,000 L</span></div><input type="range" id="vs" min="100" max="500000" step="100" value="5000" oninput="uv(this.value)"></div>
        <div class="fg"><label>Requestor Type</label><select id="b-rtype"><option>Government / Ministry</option><option>NGO / Humanitarian</option><option>Community Leader</option><option>Industrial / Commercial</option><option>Individual / Family</option></select></div>
        <div class="fg"><label>Priority Level</label><select id="b-pri"><option value="Standard">Standard - 7 to 14 days</option><option value="Urgent">Urgent - 2 to 4 days</option><option value="Emergency">Emergency - 24 to 48 hours</option></select></div>
        <div class="fg"><label>Required By Date</label><input type="date" id="b-date"></div>
        <div class="fg"><label>Notes</label><input type="text" id="b-notes" placeholder="Special instructions..."></div>
      </div>
      <div id="b-err" style="background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);border-radius:10px;padding:9px 13px;color:var(--coral);font-size:.82rem;margin-top:12px;display:none"></div>
      <div class="btns"><button class="btn btn-p" id="b-btn" onclick="submitBook()">CONFIRM BOOKING →</button><button class="btn btn-g" onclick="resetBook()">Clear</button></div>
    </div>
  </div>
  <div class="page" id="pg-bookings">
    <div class="ptitle">My Bookings</div><p class="psub">Track and manage all your water orders.</p>
    <div class="frow">
      <input type="text" id="f-search" placeholder="Search..." oninput="loadBookings()" style="flex:1;min-width:130px">
      <select id="f-status" onchange="loadBookings()"><option value="all">All Statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="transit">In Transit</option><option value="complete">Complete</option></select>
      <button class="btn btn-g" style="padding:8px 14px;font-size:.78rem" onclick="loadBookings()">↻</button>
    </div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>ID</th><th>Destination</th><th>Type</th><th>Volume</th><th>Priority</th><th>Status</th><th>Paid</th><th>Date</th><th>Action</th></tr></thead>
      <tbody id="bk-rows"></tbody>
    </table></div><div id="bk-empty" class="empty" style="display:none"><div style="font-size:2rem;margin-bottom:10px">💧</div><span id="bk-msg">No bookings yet.</span></div></div>
  </div>
  <div class="page" id="pg-suppliers">
    <div class="ptitle">Water Suppliers</div><p class="psub">Verified water suppliers registered on AquaLink.</p>
    <div class="info-banner">ℹ️ When you book water, our team matches you with the nearest verified supplier and coordinates delivery to your location.</div>
    <div class="panel" style="padding:0;overflow:hidden"><div class="tscroll"><table>
      <thead><tr><th>Supplier</th><th>Country</th><th>Water Types</th><th>Coverage Area</th><th>Status</th></tr></thead>
      <tbody id="pub-sup-rows"></tbody>
    </table></div><div id="pub-sup-empty" class="empty" style="display:none"><div style="font-size:2rem;margin-bottom:10px">🚚</div><p>No verified suppliers yet.</p></div></div>
  </div>
  <div class="page" id="pg-supplier">
    <div class="ptitle">Supplier Dashboard</div><p class="psub">Manage your water supply orders here.</p>
    <div id="sup-pending-banner" class="info-banner" style="display:none;background:rgba(255,209,102,0.08);border-color:rgba(255,209,102,0.2);color:var(--gold)">⏳ <strong>Your account is pending verification.</strong> Our team will review your application within 24 hours.</div>
    <div id="sup-verified-banner" class="info-banner" style="display:none">✅ <strong>You are a Verified AquaLink Supplier!</strong> Available orders appear below.</div>
    <div class="dcards">
      <div class="dcard"><div class="dcard-label">Available Orders</div><div class="dcard-val" id="sup-avail">-</div><div class="dcard-tag">In your region</div></div>
      <div class="dcard"><div class="dcard-label">Completed Deliveries</div><div class="dcard-val" id="sup-done">-</div><div class="dcard-tag">All time</div></div>
      <div class="dcard"><div class="dcard-label">Pending Payment</div><div class="dcard-val" id="sup-pp">-</div><div class="dcard-tag">From AquaLink</div></div>
      <div class="dcard"><div class="dcard-label">Total Earned</div><div class="dcard-val" id="sup-earned">-</div><div class="dcard-tag">NGN (85% of orders)</div></div>
    </div>
    <div class="panel">
      <div class="ptit">Available Paid Bookings</div>
      <p style="color:var(--muted);font-size:.82rem;margin-bottom:14px">Paid bookings that need a supplier. Click Accept to email AquaLink and confirm you can fulfill this order.</p>
      <div class="tscroll"><table><thead><tr><th>Booking ID</th><th>Destination</th><th>Type</th><th>Volume</th><th>Priority</th><th>Est. Delivery</th><th>Your Payout</th><th>Action</th></tr></thead><tbody id="sup-order-rows"></tbody></table></div>
      <div id="sup-order-empty" class="empty" style="display:none"><div style="font-size:2rem;margin-bottom:10px">📦</div><p>No available orders right now.</p></div>
    </div>
    <div class="panel">
      <div class="ptit">Contact AquaLink</div>
      <a href="mailto:aqualink79@gmail.com" style="display:inline-flex;align-items:center;gap:8px;padding:11px 18px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:12px;color:var(--glow);text-decoration:none;font-size:.85rem;font-weight:600">📧 aqualink79@gmail.com</a>
    </div>
  </div>
</div>

<div class="toast" id="toast"><span id="ti">✅</span>&nbsp;<span id="tm"></span></div>

<script>
var TOKEN=localStorage.getItem('aq_token');var ME=null;var BOOKING_ID=null;var BOOKING_VOL=0;var PAYSTACK_KEY='';var PRICE_KOBO=10;var SEL_TYPE='consumer';
async function api(m,p,d){var o={method:m,headers:{'Content-Type':'application/json'}};if(TOKEN)o.headers['Authorization']='Bearer '+TOKEN;if(d)o.body=JSON.stringify(d);try{var r=await fetch('/api'+p,o);return await r.json();}catch(e){return{error:'Cannot reach server.'};}}
async function loadStats(){var r=await api('GET','/public-stats');if(r.error)return;cnt('ls-bookings',r.totalBookings);cnt('ls-users',r.totalUsers);var l=r.totalLitres;document.getElementById('ls-litres').textContent=l>=1e6?(l/1e6).toFixed(1)+'M':l>=1000?(l/1000).toFixed(0)+'K':l||'0';cnt('ls-suppliers',r.totalSuppliers);}
function cnt(id,t){var el=document.getElementById(id);if(!el||!t)return;var s=performance.now(),d=1500;(function tick(n){var p=Math.min((n-s)/d,1),v=Math.round(t*(1-Math.pow(1-p,3)));el.textContent=v.toLocaleString();if(p<1)requestAnimationFrame(tick);else el.textContent=t.toLocaleString();})(s);}
function openAuth(tab,type){SEL_TYPE=type||'consumer';switchTab(tab==='login'?'login':'register');if(tab!=='login')selType(SEL_TYPE);clrMsg();document.getElementById('auth-overlay').classList.add('open');}
function closeAuth(){document.getElementById('auth-overlay').classList.remove('open');}
function closeOverlay(e){if(e.target===document.getElementById('auth-overlay'))closeAuth();}
function switchTab(tab){document.querySelectorAll('.mtab').forEach(function(t,i){t.classList.toggle('on',(tab==='login'&&i===0)||(tab==='register'&&i===1));});document.getElementById('auth-login').style.display=tab==='login'?'block':'none';document.getElementById('auth-register').style.display=tab==='register'?'block':'none';clrMsg();}
function clrMsg(){document.getElementById('merr').style.display='none';document.getElementById('mok').style.display='none';}
function showErr(m){var e=document.getElementById('merr');e.textContent=m;e.style.display='block';}
function showOk(m){var e=document.getElementById('mok');e.textContent=m;e.style.display='block';}
function selType(t){SEL_TYPE=t;document.getElementById('tc-consumer').classList.toggle('sel',t==='consumer');document.getElementById('tc-supplier').classList.toggle('sel',t==='supplier');document.getElementById('r-sup-extra').style.display=t==='supplier'?'block':'none';}
async function doLogin(){clrMsg();var em=document.getElementById('l-email').value.trim(),pw=document.getElementById('l-pass').value;if(!em||!pw){showErr('Please enter your email and password.');return;}var btn=document.getElementById('l-btn');btn.disabled=true;btn.textContent='Logging in...';var r=await api('POST','/login',{email:em,password:pw});btn.disabled=false;btn.textContent='LOGIN →';if(r.error){showErr(r.error);return;}TOKEN=r.token;ME=r.user;localStorage.setItem('aq_token',TOKEN);showOk('Welcome back, '+ME.name+'!');setTimeout(function(){closeAuth();startApp();},700);}
async function doRegister(){clrMsg();var name=document.getElementById('r-name').value.trim(),email=document.getElementById('r-email').value.trim(),pass=document.getElementById('r-pass').value,country=document.getElementById('r-country').value.trim(),org=document.getElementById('r-org').value.trim();if(!name||!email||!pass||!country){showErr('Name, email, password and country are required.');return;}if(pass.length<6){showErr('Password must be at least 6 characters.');return;}var sup={};if(SEL_TYPE==='supplier'){sup={waterTypes:document.getElementById('r-water-types').value,capacity:document.getElementById('r-capacity').value,regions:document.getElementById('r-regions').value};}var role=SEL_TYPE==='supplier'?'supplier':SEL_TYPE==='admin'?'admin':'user';var btn=document.getElementById('r-btn');btn.disabled=true;btn.textContent='Creating...';var r=await api('POST','/register',{name:name,email:email,password:pass,country:country,organization:org,role:role,userType:SEL_TYPE,supplierData:sup});btn.disabled=false;btn.textContent='CREATE ACCOUNT →';if(r.error){showErr(r.error);return;}TOKEN=r.token;ME=r.user;localStorage.setItem('aq_token',TOKEN);showOk(r.message);setTimeout(function(){closeAuth();startApp();},800);}
function doLogout(){TOKEN=null;ME=null;localStorage.removeItem('aq_token');document.getElementById('app').style.display='none';document.getElementById('landing').style.display='block';toast('👋','Logged out!');}
function goLanding(){document.getElementById('app').style.display='none';document.getElementById('landing').style.display='block';}
function startApp(){document.getElementById('landing').style.display='none';document.getElementById('app').style.display='block';document.getElementById('tav').textContent=ME.name[0].toUpperCase();document.getElementById('tuname').textContent=ME.name.split(' ')[0];document.getElementById('turole').textContent=ME.userType==='supplier'?'Supplier':ME.role==='admin'?'Admin':'Consumer';document.getElementById('b-date').value=new Date(Date.now()+7*864e5).toISOString().slice(0,10);var nav=document.getElementById('tnav');nav.innerHTML='';if(ME.role==='admin'){addNav(nav,'Overview','admin');addNav(nav,'Bookings','admin-bookings');addNav(nav,'Suppliers','admin-suppliers');addNav(nav,'Users','admin-users');addNav(nav,'Revenue','admin-revenue');goPage('admin');}else if(ME.userType==='supplier'){addNav(nav,'My Dashboard','supplier');addNav(nav,'All Suppliers','suppliers');goPage('supplier');}else{addNav(nav,'Dashboard','dashboard');addNav(nav,'Book Water','book');addNav(nav,'My Bookings','bookings');addNav(nav,'Suppliers','suppliers');goPage('dashboard');}}
function addNav(nav,label,pg){var b=document.createElement('button');b.className='nb';b.textContent=label;b.onclick=function(){goPage(pg);};b.id='nb-'+pg;nav.appendChild(b);}
function goPage(pg){document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});document.querySelectorAll('.nb').forEach(function(b){b.classList.remove('on');});var pe=document.getElementById('pg-'+pg);if(pe)pe.classList.add('on');var ne=document.getElementById('nb-'+pg);if(ne)ne.classList.add('on');if(pg==='admin')loadAdminDash();if(pg==='admin-bookings')loadAdminBookings();if(pg==='admin-suppliers')loadAdminSuppliers();if(pg==='admin-users')loadAdminUsers();if(pg==='admin-revenue')loadAdminRevenue();if(pg==='dashboard')loadConsDash();if(pg==='bookings')loadBookings();if(pg==='suppliers')loadPubSuppliers();if(pg==='supplier')loadSupDash();}
async function loadAdminDash(){var r=await api('GET','/stats');if(r.error)return;document.getElementById('a-bookings').textContent=r.totalBookings;document.getElementById('a-users').textContent=r.totalUsers;document.getElementById('a-approvals').textContent=r.pendingSuppliers||0;document.getElementById('a-pending').textContent=r.byStatus.pending;document.getElementById('a-active').textContent=r.byStatus.active;document.getElementById('a-transit').textContent=r.byStatus.transit;document.getElementById('a-complete').textContent=r.byStatus.complete;var rev=r.totalRevenue||0;document.getElementById('a-revenue').textContent=rev>=1000?(rev/1000).toFixed(0)+'K':rev;document.getElementById('a-recent').innerHTML=(r.recentBookings||[]).map(function(b){return'<tr><td class=bid>'+b.id+'</td><td>'+b.destination+'</td><td>'+fv(b.volumeLitres)+'</td><td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td><td><span class="badge '+sc(b.status)+'">'+b.status+'</span></td><td>'+(b.paid?'<span style="color:var(--green)">✅</span>':'<span style="color:var(--muted)">—</span>')+'</td></tr>';}).join('')||'<tr><td colspan=6 style="text-align:center;color:var(--muted);padding:20px">No bookings yet.</td></tr>';var tot=r.totalBookings||1;document.getElementById('a-status-bars').innerHTML=Object.entries(r.byStatus).map(function(e){return'<div class=bar-item><div class=bar-head><span style="color:var(--ice);text-transform:capitalize">'+e[0]+'</span><span style="color:var(--glow)">'+e[1]+'</span></div><div class=bar-track><div class=bar-fill style="width:'+(e[1]/tot*100)+'%"></div></div></div>';}).join('');}
async function loadAdminBookings(){var search=document.getElementById('ab-search')?document.getElementById('ab-search').value:'';var status=document.getElementById('ab-status')?document.getElementById('ab-status').value:'all';var r=await api('GET','/bookings?status='+status+(search?'&search='+encodeURIComponent(search):''));var ur=await api('GET','/users');var users=ur.users||[];var tbody=document.getElementById('ab-rows'),empty=document.getElementById('ab-empty');if(!r.bookings||r.bookings.length===0){tbody.innerHTML='';empty.style.display='block';return;}empty.style.display='none';var rows='';for(var i=0;i<r.bookings.length;i++){var b=r.bookings[i];var cust=users.find(function(u){return u.id===b.userId;});var statusSel='<select class=ssel onchange="updStat(this.dataset.id,this.value)" data-id="'+b.id+'">';statusSel+='<option value=pending'+(b.status==='pending'?' selected':'')+'>Pending</option>';statusSel+='<option value=active'+(b.status==='active'?' selected':'')+'>Active</option>';statusSel+='<option value=transit'+(b.status==='transit'?' selected':'')+'>Transit</option>';statusSel+='<option value=complete'+(b.status==='complete'?' selected':'')+'>Complete</option>';statusSel+='</select>';var paidCell=b.paid?'<span style="color:var(--green);font-weight:600">&#10003; NGN '+(b.amountPaid||0).toLocaleString()+'</span>':'<span style="color:var(--muted)">Unpaid</span>';rows+='<tr><td class=bid>'+b.id+'</td><td style="font-size:.8rem">'+(cust?cust.name:'—')+'</td><td>'+b.destination+'</td><td>'+fv(b.volumeLitres)+'</td><td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td><td>'+statusSel+'</td><td>'+paidCell+'</td><td style="color:var(--muted);font-size:.78rem">'+b.createdAt.slice(0,10)+'</td><td><button class=btn-d data-bid="'+b.id+'" onclick="cancelB(this.dataset.bid)">Cancel</button></td></tr>';}tbody.innerHTML=rows;}
async function loadAdminSuppliers(){var r=await api('GET','/suppliers');var sups=r.suppliers||[];var pend=sups.filter(function(s){return s.status!=='verified';});var ver=sups.filter(function(s){return s.status==='verified';});document.getElementById('sup-pend-count').textContent=pend.length;document.getElementById('sup-ver-count').textContent=ver.length;var tbody=document.getElementById('sup-rows'),empty=document.getElementById('sup-empty');if(sups.length===0){tbody.innerHTML='';empty.style.display='block';return;}empty.style.display='none';var rows='';for(var i=0;i<sups.length;i++){var s=sups[i];var isV=s.status==='verified';var statusBadge='<span class="badge '+(isV?'b-active':'b-pending')+'">'+(isV?'Verified':'Pending')+'</span>';var actionCell='';if(isV){actionCell='<button class=btn-d data-sid="'+s.id+'" data-status="rejected" onclick="supAction(this.dataset.sid,this.dataset.status)">Revoke</button>';}else{actionCell='<button class="btn btn-p" style="padding:5px 11px;font-size:.76rem;margin-right:4px" data-sid="'+s.id+'" data-status="verified" onclick="supAction(this.dataset.sid,this.dataset.status)">Approve</button>';actionCell+='<button class=btn-d data-sid="'+s.id+'" data-status="rejected" onclick="supAction(this.dataset.sid,this.dataset.status)">Reject</button>';}rows+='<tr><td style="font-weight:600">'+s.name+'</td><td>'+s.organization+'</td><td>'+s.country+'</td><td style="color:var(--muted)">'+s.waterTypes+'</td><td style="font-size:.8rem;color:var(--muted)">'+s.regions+'</td><td>'+statusBadge+'</td><td>'+actionCell+'</td></tr>';}tbody.innerHTML=rows;}
async function supAction(id,status){if(status==='rejected'&&!confirm('Revoke/reject this supplier?'))return;var r=await api('PUT','/suppliers/'+id+'/status',{status:status});if(r.error){toast('X',r.error);return;}toast('OK',status==='verified'?'Supplier approved! They will receive an email.':'Supplier status updated.');loadAdminSuppliers();}
async function loadAdminUsers(){var r=await api('GET','/users');if(r.error)return;document.getElementById('admin-users-rows').innerHTML=(r.users||[]).map(function(u){var badge=u.userType==='supplier'?'b-supplier':u.role==='admin'?'b-crit':'b-pending';return'<tr><td style="font-weight:600">'+u.name+'</td><td style="color:var(--muted)">'+u.email+'</td><td><span class="badge '+badge+'">'+(u.userType||u.role)+'</span></td><td>'+(u.organization||'—')+'</td><td>'+(u.country||'—')+'</td><td style="color:var(--muted);font-size:.78rem">'+u.createdAt.slice(0,10)+'</td></tr>';}).join('');}
async function loadAdminRevenue(){var r=await api('GET','/bookings?status=all');var paid=(r.bookings||[]).filter(function(b){return b.paid;});var tot=paid.reduce(function(s,b){return s+(b.amountPaid||0);},0);document.getElementById('rev-total').textContent=tot>=1000?(tot/1000).toFixed(1)+'K':tot;document.getElementById('rev-comm').textContent=Math.round(tot*0.15).toLocaleString();document.getElementById('rev-pay').textContent=Math.round(tot*0.85).toLocaleString();document.getElementById('rev-count').textContent=paid.length;var ur=await api('GET','/users');var users=ur.users||[];var tbody=document.getElementById('rev-rows'),empty=document.getElementById('rev-empty');if(paid.length===0){tbody.innerHTML='';empty.style.display='block';return;}empty.style.display='none';tbody.innerHTML=paid.map(function(b){var cust=users.find(function(u){return u.id===b.userId;});var amt=b.amountPaid||0;return'<tr><td class=bid>'+b.id+'</td><td style="font-size:.8rem">'+(cust?cust.name:'—')+'</td><td>'+b.destination+'</td><td style="color:var(--green);font-weight:600">'+amt.toLocaleString()+'</td><td style="color:var(--glow)">'+Math.round(amt*0.15).toLocaleString()+'</td><td style="color:var(--muted)">'+Math.round(amt*0.85).toLocaleString()+'</td><td style="color:var(--muted);font-size:.78rem">'+(b.paidAt||b.createdAt).slice(0,10)+'</td></tr>';}).join('');}
async function loadConsDash(){var r=await api('GET','/bookings');var bk=r.bookings||[];document.getElementById('c-total').textContent=bk.length;document.getElementById('c-pending').textContent=bk.filter(function(b){return b.status==='pending';}).length;document.getElementById('c-complete').textContent=bk.filter(function(b){return b.status==='complete';}).length;var tl=bk.reduce(function(s,b){return s+b.volumeLitres;},0);document.getElementById('c-litres').textContent=tl>=1e6?(tl/1e6).toFixed(1)+'M':tl>=1000?(tl/1000).toFixed(0)+'K':tl;document.getElementById('c-recent').innerHTML=bk.slice(0,5).map(function(b){return'<tr><td class=bid>'+b.id+'</td><td>'+b.destination+'</td><td>'+fv(b.volumeLitres)+'</td><td><span class="badge '+sc(b.status)+'">'+b.status+'</span></td><td>'+(b.paid?'<span style="color:var(--green)">✅</span>':'<span style="color:var(--muted)">—</span>')+'</td></tr>';}).join('')||'<tr><td colspan=5 style="text-align:center;color:var(--muted);padding:20px">No bookings yet.</td></tr>';}
async function loadBookings(){var search=document.getElementById('f-search')?document.getElementById('f-search').value:'';var status=document.getElementById('f-status')?document.getElementById('f-status').value:'all';var r=await api('GET','/bookings?status='+status+(search?'&search='+encodeURIComponent(search):''));var tbody=document.getElementById('bk-rows'),empty=document.getElementById('bk-empty');if(!r.bookings||r.bookings.length===0){tbody.innerHTML='';empty.style.display='block';document.getElementById('bk-msg').textContent='No bookings yet. Go to Book Water to place your first order.';return;}empty.style.display='none';var rows='';for(var i=0;i<r.bookings.length;i++){var b=r.bookings[i];var payCell=b.paid?'<span style="color:var(--green);font-weight:600;font-size:.78rem">Paid</span>':'<button class="btn btn-p" style="padding:4px 10px;font-size:.74rem" data-bid="'+b.id+'" data-vol="'+b.volumeLitres+'" onclick="payBook(this.dataset.bid,parseInt(this.dataset.vol))">Pay</button>';rows+='<tr><td class=bid>'+b.id+'</td><td>'+b.destination+'</td><td style="color:var(--muted)">'+b.waterType+'</td><td style="font-weight:600">'+fv(b.volumeLitres)+'</td><td><span class="badge '+pc(b.priority)+'">'+b.priority+'</span></td><td><span class="badge '+sc(b.status)+'">'+b.status+'</span></td><td>'+payCell+'</td><td style="color:var(--muted);font-size:.78rem">'+b.createdAt.slice(0,10)+'</td><td><button class=btn-d data-bid="'+b.id+'" onclick="cancelB(this.dataset.bid)">Cancel</button></td></tr>';}tbody.innerHTML=rows;}
async function updStat(id,status){var r=await api('PUT','/bookings/'+id+'/status',{status:status});if(r.error)toast('❌',r.error);else toast('✅','Updated to '+status);}
async function cancelB(id){if(!confirm('Cancel booking '+id+'?'))return;var r=await api('DELETE','/bookings/'+id);if(r.error){toast('❌',r.error);return;}toast('🗑️','Cancelled.');loadBookings();}
async function loadPubSuppliers(){var r=await api('GET','/suppliers');var verified=(r.suppliers||[]).filter(function(s){return s.status==='verified';});var tbody=document.getElementById('pub-sup-rows'),empty=document.getElementById('pub-sup-empty');if(verified.length===0){tbody.innerHTML='';empty.style.display='block';return;}empty.style.display='none';tbody.innerHTML=verified.map(function(s){return'<tr><td style="font-weight:600">'+s.name+'</td><td>'+s.country+'</td><td style="color:var(--muted)">'+s.waterTypes+'</td><td style="font-size:.8rem;color:var(--muted)">'+s.regions+'</td><td><span class="badge b-active">✅ Verified</span></td></tr>';}).join('');}
async function loadSupDash(){var sr=await api('GET','/suppliers');var me=(sr.suppliers||[]).find(function(s){return s.id===ME.id;});var isV=me&&me.status==='verified';document.getElementById('sup-pending-banner').style.display=!isV?'block':'none';document.getElementById('sup-verified-banner').style.display=isV?'block':'none';var r=await api('GET','/bookings?status=all');var all=r.bookings||[];var avail=all.filter(function(b){return b.paid&&b.status!=='complete';});var done=all.filter(function(b){return b.status==='complete';});var earned=done.reduce(function(s,b){return s+((b.amountPaid||0)*0.85);},0);document.getElementById('sup-avail').textContent=avail.length;document.getElementById('sup-done').textContent=done.length;document.getElementById('sup-pp').textContent=avail.filter(function(b){return b.status==='active';}).length;document.getElementById('sup-earned').textContent='NGN '+Math.round(earned).toLocaleString();var tbody=document.getElementById('sup-order-rows'),empty=document.getElementById('sup-order-empty');if(avail.length===0){tbody.innerHTML='';empty.style.display='block';return;}empty.style.display='none';tbody.innerHTML=avail.map(function(b){var payout=Math.round((b.amountPaid||0)*0.85);var priC=b.priority==='Emergency'?'var(--coral)':b.priority==='Urgent'?'var(--gold)':'var(--muted)';return'<tr><td class=bid>'+b.id+'</td><td>'+b.destination+'</td><td style="color:var(--muted)">'+b.waterType+'</td><td style="font-weight:600">'+fv(b.volumeLitres)+'</td><td style="color:'+priC+';font-weight:600">'+b.priority+'</td><td style="color:var(--muted)">'+b.estimatedDelivery+'</td><td style="color:var(--green);font-weight:600">NGN '+payout.toLocaleString()+'</td><td><a href="mailto:aqualink79@gmail.com?subject=Accept Order '+b.id+'&body=I accept booking '+b.id+' for '+b.destination+'" style="display:inline-block;padding:5px 11px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);border-radius:8px;color:var(--glow);text-decoration:none;font-size:.76rem;font-weight:600">Accept</a></td></tr>';}).join('');}
function pp(el){el.closest('.pills').querySelectorAll('.pill').forEach(function(p){p.classList.remove('on');});el.classList.add('on');}
function uv(v){var n=parseInt(v);document.getElementById('vd').textContent=n>=1e6?(n/1e6).toFixed(1)+'M L':n>=1000?(n/1000).toFixed(0)+'K L':n+' L';}
async function submitBook(){document.getElementById('b-err').style.display='none';var country=document.getElementById('b-country').value;if(!country){var e=document.getElementById('b-err');e.textContent='Please select a destination country.';e.style.display='block';return;}var pill=document.querySelector('.pill.on'),type=pill?pill.textContent.trim():'Potable';var btn=document.getElementById('b-btn');btn.disabled=true;btn.textContent='Confirming...';var r=await api('POST','/bookings',{destination:country,city:document.getElementById('b-city').value,waterType:type,volumeLitres:parseInt(document.getElementById('vs').value),priority:document.getElementById('b-pri').value,requestorType:document.getElementById('b-rtype').value,requiredBy:document.getElementById('b-date').value,notes:document.getElementById('b-notes').value});btn.disabled=false;btn.textContent='CONFIRM BOOKING →';if(r.error){var e=document.getElementById('b-err');e.textContent=r.error;e.style.display='block';return;}document.getElementById('book-form').style.display='none';document.getElementById('book-success').style.display='block';document.getElementById('s-id').textContent=r.booking.id;document.getElementById('s-msg').textContent=r.message;BOOKING_ID=r.booking.id;BOOKING_VOL=r.booking.volumeLitres;document.getElementById('pay-amount').textContent='NGN '+(r.booking.volumeLitres*PRICE_KOBO/100).toLocaleString();toast('✅','Booking '+r.booking.id+' confirmed!');}
function resetBook(){document.getElementById('book-success').style.display='none';document.getElementById('book-form').style.display='block';['b-country','b-city','b-notes'].forEach(function(id){document.getElementById(id).value='';});document.getElementById('vs').value=5000;document.getElementById('vd').textContent='5,000 L';}
async function getKey(){if(PAYSTACK_KEY)return PAYSTACK_KEY;var r=await api('GET','/paystack-key');PAYSTACK_KEY=r.publicKey||'';return PAYSTACK_KEY;}
async function payNow(){await openPS(BOOKING_ID,BOOKING_VOL);}
async function payBook(id,vol){BOOKING_ID=id;BOOKING_VOL=vol;await openPS(id,vol);}
async function openPS(bid,vol){if(!ME){toast('❌','Please log in.');return;}var amount=parseInt(vol)*PRICE_KOBO;if(amount<100)amount=100;var ref='AQL'+Date.now();toast('⏳','Opening payment...');var r=await api('POST','/init-payment',{email:ME.email,amount:amount,reference:ref,bookingId:bid});if(r.error){toast('❌',r.error);return;}var W=520,H=620,L=(screen.width-W)/2,T=(screen.height-H)/2;var popup=window.open(r.url,'pay','width='+W+',height='+H+',left='+L+',top='+T+',scrollbars=yes');if(!popup||popup.closed){window.location.href=r.url;return;}toast('💳','Complete payment in the popup!');var ck=setInterval(function(){if(popup.closed){clearInterval(ck);api('POST','/verify-payment',{reference:r.reference||ref,bookingId:bid}).then(function(vr){if(vr.success){toast('✅','Payment confirmed! Booking is now active.');loadBookings();}else{toast('ℹ️','Payment not completed. Pay anytime from My Bookings.');loadBookings();}});}},1500);}
async function sendContact(){var name=document.getElementById('c-name').value.trim(),email=document.getElementById('c-email').value.trim(),subj=document.getElementById('c-subj').value,msg=document.getElementById('c-msg').value.trim();var res=document.getElementById('c-result');if(!name||!email||!msg){res.style.display='block';res.style.color='var(--coral)';res.textContent='Please fill in all fields.';return;}res.style.display='block';res.style.color='var(--muted)';res.textContent='Sending...';var r=await api('POST','/contact',{name:name,email:email,subject:subj,message:msg});if(r.success){res.style.color='var(--green)';res.textContent='Message sent! We will reply within 24 hours.';document.getElementById('c-name').value='';document.getElementById('c-email').value='';document.getElementById('c-msg').value='';}else{res.style.color='var(--coral)';res.textContent='Failed. Please email aqualink79@gmail.com directly.';}}
function fv(l){return l>=1e6?(l/1e6).toFixed(1)+'M L':l>=1000?(l/1000).toFixed(0)+'K L':l+' L';}
function pc(p){return p==='Emergency'?'b-crit':p==='Urgent'?'b-pending':'b-complete';}
function sc(s){return s==='active'?'b-active':s==='pending'?'b-pending':s==='transit'?'b-transit':'b-complete';}
function toast(ico,msg){document.getElementById('ti').textContent=ico;document.getElementById('tm').textContent=msg;var t=document.getElementById('toast');t.classList.add('show');setTimeout(function(){t.classList.remove('show');},4000);}
loadStats();
(async function(){if(TOKEN){var r=await api('GET','/me');if(!r.error){ME=r.user;startApp();return;}localStorage.removeItem('aq_token');TOKEN=null;}})();
</script>
</body>
</html>`;

// ── SEED & SERVER ─────────────────────────────────────
seed();

http.createServer(async function(req, res) {
  var method  = req.method;
  var rawUrl  = req.url.split('?')[0];
  var qs      = req.url.split('?')[1] || '';
  var query   = {};
  qs.split('&').forEach(function(p){ var kv=p.split('='); if(kv[0]) query[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||''); });

  cors(res);
  if (method==='OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── POLICY ROUTES (NEW) ───────────────────────────
  if (rawUrl==='/privacy' && method==='GET') {
    return html(res, policyPage('Privacy Policy', PRIVACY_CONTENT));
  }
  if (rawUrl==='/terms' && method==='GET') {
    return html(res, policyPage('Terms of Service', TERMS_CONTENT));
  }
  if (rawUrl==='/refund' && method==='GET') {
    return html(res, policyPage('Refund Policy', REFUND_CONTENT));
  }
  if (rawUrl==='/shipping' && method==='GET') {
    return html(res, policyPage('Shipping & Delivery Policy', SHIPPING_CONTENT));
  }

  // All other non-API routes serve the main app
  if (!rawUrl.startsWith('/api')) { html(res, APP); return; }

  var route = rawUrl.replace('/api','') || '/';

  if (route==='/public-stats' && method==='GET') {
    var db=loadDB();
    return json(res,200,{totalBookings:db.bookings.length,totalUsers:db.users.length,totalLitres:db.bookings.reduce(function(s,b){return s+(b.volumeLitres||0);},0),totalSuppliers:(db.suppliers||[]).filter(function(s){return s.status==='verified';}).length});
  }

  if (route==='/register' && method==='POST') {
    var data=await getBody(req);
    if(!data.name||!data.email||!data.password) return json(res,400,{error:'Name, email and password are required.'});
    if(data.password.length<6) return json(res,400,{error:'Password must be at least 6 characters.'});
    var db=loadDB();
    if(db.users.find(function(u){return u.email===data.email;})) return json(res,409,{error:'Email already registered. Please log in.'});
    var user={id:uid(),name:data.name,email:data.email,passwordHash:hashPw(data.password),role:data.role||'user',organization:data.organization||'',country:data.country||'',userType:data.userType||'consumer',createdAt:new Date().toISOString()};
    db.users.push(user);
    if(data.userType==='supplier'){
      db.suppliers=db.suppliers||[];
      db.suppliers.push({id:user.id,name:user.name,organization:user.organization||user.name,country:user.country,waterTypes:data.supplierData&&data.supplierData.waterTypes||'Potable',capacity:data.supplierData&&data.supplierData.capacity||'',regions:data.supplierData&&data.supplierData.regions||user.country,status:'pending',createdAt:user.createdAt});
    }
    saveDB(db);
    emailWelcome(user);
    var msg=data.userType==='supplier'?'Welcome! Your supplier application has been received. Our team will verify you within 24 hours.':'Welcome to AquaLink, '+data.name+'! You can now book water.';
    return json(res,201,{message:msg,user:safeUser(user),token:makeToken(user)});
  }

  if (route==='/login' && method==='POST') {
    var data=await getBody(req);
    if(!data.email||!data.password) return json(res,400,{error:'Email and password are required.'});
    var db=loadDB();
    var user=db.users.find(function(u){return u.email===data.email;});
    if(!user||hashPw(data.password)!==user.passwordHash) return json(res,401,{error:'Wrong email or password.'});
    return json(res,200,{message:'Welcome back, '+user.name+'!',user:safeUser(user),token:makeToken(user)});
  }

  if (route==='/me' && method==='GET') {
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var db=loadDB(); var user=db.users.find(function(u){return u.id===auth.id;}); if(!user) return json(res,404,{error:'Not found.'});
    return json(res,200,{user:safeUser(user)});
  }

  if (route==='/bookings' && method==='GET') {
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var db=loadDB();
    var list=auth.role==='admin'?db.bookings:db.bookings.filter(function(b){return b.userId===auth.id;});
    if(query.status&&query.status!=='all') list=list.filter(function(b){return b.status===query.status;});
    if(query.search){var s=query.search.toLowerCase();list=list.filter(function(b){return b.destination.toLowerCase().indexOf(s)>-1||b.id.toLowerCase().indexOf(s)>-1;});}
    return json(res,200,{bookings:list.sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt);}),total:list.length});
  }

  if (route==='/bookings' && method==='POST') {
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var data=await getBody(req);
    if(!data.destination||!data.waterType||!data.volumeLitres) return json(res,400,{error:'Destination, water type and volume are required.'});
    var db=loadDB();
    var days=data.priority==='Emergency'?2:data.priority==='Urgent'?4:14;
    var booking={id:nextId(),userId:auth.id,destination:data.city?data.city+', '+data.destination:data.destination,waterType:data.waterType,volumeLitres:parseInt(data.volumeLitres),priority:data.priority||'Standard',status:'pending',requestorType:data.requestorType||'Individual',requiredBy:data.requiredBy||'',notes:data.notes||'',paid:false,createdAt:new Date().toISOString(),estimatedDelivery:new Date(Date.now()+days*86400000).toISOString().slice(0,10)};
    db.bookings.push(booking); saveDB(db);
    var booker=db.users.find(function(u){return u.id===auth.id;});
    if(booker) emailNewBooking(booking,booker.name,booker.email);
    return json(res,201,{message:'Booking '+booking.id+' confirmed! A confirmation email has been sent.',booking:booking});
  }

  var smatch=route.match(/^\/bookings\/(.+)\/status$/);
  if(smatch&&method==='PUT'){
    var auth=checkToken(getToken(req)); if(!auth||auth.role!=='admin') return json(res,403,{error:'Admin only.'});
    var data=await getBody(req); var db=loadDB();
    var idx=db.bookings.findIndex(function(b){return b.id===smatch[1];}); if(idx===-1) return json(res,404,{error:'Not found.'});
    db.bookings[idx].status=data.status; saveDB(db);
    return json(res,200,{message:'Updated!',booking:db.bookings[idx]});
  }

  var dmatch=route.match(/^\/bookings\/(.+)$/);
  if(dmatch&&method==='DELETE'){
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var db=loadDB(); var idx=db.bookings.findIndex(function(b){return b.id===dmatch[1];}); if(idx===-1) return json(res,404,{error:'Not found.'});
    if(auth.role!=='admin'&&db.bookings[idx].userId!==auth.id) return json(res,403,{error:'Access denied.'});
    db.bookings.splice(idx,1); saveDB(db);
    return json(res,200,{message:'Booking cancelled.'});
  }

  if (route==='/suppliers'&&method==='GET') {
    return json(res,200,{suppliers:loadDB().suppliers||[]});
  }

  var supmatch=route.match(/^\/suppliers\/(.+)\/status$/);
  if(supmatch&&method==='PUT'){
    var auth=checkToken(getToken(req)); if(!auth||auth.role!=='admin') return json(res,403,{error:'Admin only.'});
    var data=await getBody(req); var db=loadDB();
    db.suppliers=db.suppliers||[];
    var idx=db.suppliers.findIndex(function(s){return s.id===supmatch[1];}); if(idx===-1) return json(res,404,{error:'Not found.'});
    db.suppliers[idx].status=data.status; saveDB(db);
    if(data.status==='verified'){
      var sup=db.suppliers[idx];
      var user=db.users.find(function(u){return u.id===sup.id;});
      if(user) emailSupplierApproved(sup,user.email);
    }
    return json(res,200,{message:'Supplier status updated to '+data.status});
  }

  if (route==='/stats'&&method==='GET') {
    var auth=checkToken(getToken(req)); if(!auth||auth.role!=='admin') return json(res,403,{error:'Admin only.'});
    var db=loadDB();
    var paid=db.bookings.filter(function(b){return b.paid;});
    return json(res,200,{
      totalBookings:db.bookings.length,totalUsers:db.users.length,
      totalSuppliers:(db.suppliers||[]).length,
      pendingSuppliers:(db.suppliers||[]).filter(function(s){return s.status!=='verified';}).length,
      totalRevenue:paid.reduce(function(s,b){return s+(b.amountPaid||0);},0),
      totalLitres:db.bookings.reduce(function(s,b){return s+(b.volumeLitres||0);},0),
      byStatus:{pending:db.bookings.filter(function(b){return b.status==='pending';}).length,active:db.bookings.filter(function(b){return b.status==='active';}).length,transit:db.bookings.filter(function(b){return b.status==='transit';}).length,complete:db.bookings.filter(function(b){return b.status==='complete';}).length},
      byPriority:{Emergency:db.bookings.filter(function(b){return b.priority==='Emergency';}).length,Urgent:db.bookings.filter(function(b){return b.priority==='Urgent';}).length,Standard:db.bookings.filter(function(b){return b.priority==='Standard';}).length},
      recentBookings:db.bookings.slice(-5).reverse(),allBookings:db.bookings
    });
  }

  if (route==='/users'&&method==='GET') {
    var auth=checkToken(getToken(req)); if(!auth||auth.role!=='admin') return json(res,403,{error:'Admin only.'});
    return json(res,200,{users:loadDB().users.map(safeUser),total:loadDB().users.length});
  }

  if (route==='/contact'&&method==='POST') {
    var data=await getBody(req); if(!data.name||!data.email||!data.message) return json(res,400,{error:'All fields required.'});
    var adminHtml=emailWrap('<h2>New Contact Message</h2><table><tr><td>From</td><td>'+data.name+'</td></tr><tr><td>Email</td><td>'+data.email+'</td></tr><tr><td>Subject</td><td>'+data.subject+'</td></tr></table><div style="margin-top:16px;padding:14px;background:#f8fafb;border-radius:8px;color:#333;font-size:.9rem">'+data.message+'</div><p style="margin-top:12px;font-size:.82rem;color:#4a7a9b">Reply to: <a href="mailto:'+data.email+'">'+data.email+'</a></p>');
    await sendEmail(ADMIN_EMAIL,'Contact: '+data.subject+' from '+data.name,adminHtml);
    var replyHtml=emailWrap('<h2>Message Received!</h2><p>Thank you <strong>'+data.name+'</strong>! We received your message and will reply within 24 hours.</p>');
    sendEmail(data.email,'AquaLink — We received your message!',replyHtml);
    return json(res,200,{success:true});
  }

  if (route==='/paystack-key'&&method==='GET') {
    return json(res,200,{publicKey:PAYSTACK_PUB});
  }

  if (route==='/init-payment'&&method==='POST') {
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var data=await getBody(req);
    var https=require('https');
    var payload=JSON.stringify({email:data.email,amount:data.amount,reference:data.reference,currency:'NGN',metadata:{bookingId:data.bookingId}});
    var result=await new Promise(function(resolve){
      var opts={hostname:'api.paystack.co',port:443,path:'/transaction/initialize',method:'POST',headers:{'Authorization':'Bearer '+PAYSTACK_SEC,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}};
      var req2=https.request(opts,function(res2){var b='';res2.on('data',function(c){b+=c;});res2.on('end',function(){try{resolve(JSON.parse(b));}catch(e){resolve({status:false});}});});
      req2.on('error',function(e){resolve({status:false,message:e.message});});req2.write(payload);req2.end();
    });
    if(result.status&&result.data&&result.data.authorization_url) return json(res,200,{url:result.data.authorization_url,reference:result.data.reference});
    return json(res,400,{error:result.message||'Could not initialize payment.'});
  }

  if (route==='/verify-payment'&&method==='POST') {
    var auth=checkToken(getToken(req)); if(!auth) return json(res,401,{error:'Please log in.'});
    var data=await getBody(req); if(!data.reference) return json(res,400,{error:'Reference required.'});
    var https=require('https');
    var verified=await new Promise(function(resolve){
      var opts={hostname:'api.paystack.co',port:443,path:'/transaction/verify/'+data.reference,method:'GET',headers:{'Authorization':'Bearer '+PAYSTACK_SEC,'Content-Type':'application/json'}};
      var req2=https.request(opts,function(res2){var b='';res2.on('data',function(c){b+=c;});res2.on('end',function(){try{resolve(JSON.parse(b));}catch(e){resolve({status:false});}});});
      req2.on('error',function(){resolve({status:false});});req2.end();
    });
    if(verified.status&&verified.data&&verified.data.status==='success'){
      var db=loadDB();
      var idx=db.bookings.findIndex(function(b){return b.id===data.bookingId;});
      if(idx!==-1){db.bookings[idx].paid=true;db.bookings[idx].paymentRef=data.reference;db.bookings[idx].amountPaid=verified.data.amount/100;db.bookings[idx].currency=verified.data.currency;db.bookings[idx].paidAt=new Date().toISOString();saveDB(db);
        var booker=db.users.find(function(u){return u.id===auth.id;});
        if(booker) emailPayment(db.bookings[idx],booker.name,booker.email,verified.data.amount/100,verified.data.currency);
      }
      return json(res,200,{success:true,message:'Payment confirmed!',amount:verified.data.amount/100,currency:verified.data.currency});
    }
    return json(res,400,{error:'Payment verification failed.'});
  }

  json(res,404,{error:'Not found.'});

}).listen(PORT, function() {
  console.log('\n========================================');
  console.log('   AQUALINK - COMPLETE PLATFORM');
  console.log('========================================');
  console.log('   Open:     http://localhost:'+PORT);
  console.log('   Admin:    admin@aqualink.org');
  console.log('   Password: admin123');
  console.log('========================================');
  console.log('   Policy pages:');
  console.log('   /privacy   /terms   /refund   /shipping');
  console.log('========================================\n');
});




