import 'dotenv/config';
const command = process.argv[2];
const base = (process.argv[3] || '').replace(/\/$/, '');
const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;
const secret = process.env.STRAVA_WEBHOOK_SECRET;
const token = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
if (!clientId || !clientSecret) throw new Error('Falta STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET en backend/.env');
const endpoint = 'https://www.strava.com/api/v3/push_subscriptions';
if (command === 'list') {
  const u = new URL(endpoint);
  u.searchParams.set('client_id',clientId);u.searchParams.set('client_secret',clientSecret);
  const resp=await fetch(u);
  const body=await resp.json();
  if(!resp.ok) throw new Error(`Strava: ${JSON.stringify(body)}`);
  console.log('Suscripciones:',JSON.stringify(body,null,2));
} else if (command === 'register') {
  if (!secret || secret.length<32 || !token || token.length<32) throw new Error('Configura STRAVA_WEBHOOK_SECRET y STRAVA_WEBHOOK_VERIFY_TOKEN aleatorios, mínimo 32 caracteres.');
  if (!/^https:\/\/[^/]+$/.test(base)) throw new Error('Uso: npm run webhook:register -- https://NOMBRE.onrender.com');
  const callback = `${base}/api/strava/webhook/${secret}`;
  if(callback.length>255) throw new Error('El callback de Strava no puede superar 255 caracteres.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,callback_url:callback,verify_token:token})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`Strava: ${JSON.stringify(body)}. Comprueba que Render esté activo y que no exista otra suscripción.`);
  console.log('Webhook registrado. ID:',body.id,'(opcional: STRAVA_WEBHOOK_SUBSCRIPTION_ID)');
} else throw new Error('Uso: npm run webhook:list; o npm run webhook:register -- https://NOMBRE.onrender.com');
