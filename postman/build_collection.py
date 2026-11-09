import json, uuid
from pathlib import Path
out=Path('postman')
def event(kind,script): return {'listen':kind,'script':{'type':'text/javascript','exec':script.splitlines()}}
def bearer(key): return {'type':'bearer','bearer':[{'key':'token','value':'{{'+key+'}}','type':'string'}]}
def oauth(role):
 d={'grant_type':'authorization_code_with_pkCE'.lower() if False else 'authorization_code_with_pkce','authUrl':'{{keycloak_url}}/realms/{{realm}}/protocol/openid-connect/auth','accessTokenUrl':'{{keycloak_url}}/realms/{{realm}}/protocol/openid-connect/token','clientId':'{{client_id}}','clientSecret':'','redirect_uri':'{{callback_url}}','scope':'openid profile email','challengeAlgorithm':'S256','client_authentication':'body','addTokenTo':'header','tokenName':'ticketnow-'+role,'accessToken':'{{'+role+'_access_token}}','useBrowser':False}
 return {'type':'oauth2','oauth2':[{'key':k,'value':v,'type':'boolean' if isinstance(v,bool) else 'string'} for k,v in d.items()]}
def req(name,method,url,status=200,auth=None,body=None,form=None,save=None,description='',test='',pre=''):
 r={'method':method,'header':[],'url':url,'description':description}
 if auth is not None:r['auth']=auth
 if body is not None:r['header']=[{'key':'Content-Type','value':'application/json'}];r['body']={'mode':'raw','raw':json.dumps(body,ensure_ascii=False,indent=2) if not isinstance(body,str) else body,'options':{'raw':{'language':'json'}}}
 if form is not None:r['body']={'mode':'urlencoded','urlencoded':[{'key':k,'value':v,'type':'text'} for k,v in form.items()]}
 script=f'pm.test("HTTP {status}", () => pm.response.to.have.status({status}));'
 if save:script+='\nif (pm.response.code === '+str(status)+') { pm.environment.set("'+save+'", pm.response.json().id); }'
 if test:script+='\n'+test
 item={'name':name,'request':r,'response':[],'event':[event('test',script)]}
 if pre:item['event'].insert(0,event('prerequest',pre))
 return item
no={'type':'noauth'}
base='{{base_url}}/api/v1'
kc='{{keycloak_url}}/realms/{{realm}}/protocol/openid-connect'
admin='{{keycloak_url}}/admin/realms/{{realm}}'
venue={'name':'Postman Test Hall','address':'123 Nguyen Hue','city':'HCM','capacity':100}
eventbody={'title':'Postman Test Concert','description':'Created by TicketNow collection','venueId':'{{venue_id}}','startsAt':'{{starts_at}}','endsAt':'{{ends_at}}'}
tier={'name':'VIP','price':500000,'currency':'VND'}
sectionbody={'name':'A','tierId':'{{tier_id}}','rowCount':2,'seatsPerRow':10}
folders=[]
def folder(name,items,description='',auth=None):
 f={'name':name,'description':description,'item':items}
 if auth:f['auth']=auth
 folders.append(f);return f
logins=[req('01 - OIDC discovery','GET','{{keycloak_url}}/realms/{{realm}}/.well-known/openid-configuration',auth=no,test='pm.test("Correct issuer", () => pm.expect(pm.response.json().issuer).to.eql(pm.variables.replaceIn("{{keycloak_url}}/realms/{{realm}}")));')]
for role in ['admin','organizer','customer']:
 script='''if (pm.response.code === 200) {
 const data = pm.response.json();
 pm.test("User subject exists", () => pm.expect(data.sub).to.be.a("string").and.not.empty);
 const raw = pm.request.auth && pm.request.auth.oauth2.get("accessToken");
 const token = typeof raw === "string" ? pm.variables.replaceIn(raw) : "";
 if (token && !token.includes("{{")) pm.environment.set("ROLE_access_token", token);
 pm.environment.set("ROLE_sub", data.sub);
}'''.replace('ROLE',role)
 logins.append(req('Login '+role+' - PKCE then UserInfo','GET',kc+'/userinfo',auth=oauth(role),description='Authorization > Get New Access Token > login '+role+'01 > Use Token > Send. Copy the access token into environment '+role+'_access_token if it is not saved automatically. This is interactive login, not an automated Runner step.',test=script))
folder('00 - Login (interactive PKCE)',logins,'Run discovery, then get 3 separate tokens. Do not use password grant for ticketnow-postman.')
folder('01 - Venues (admin)',[
 req('Create venue','POST',base+'/venues',201,body=venue,save='venue_id'),
 req('List venues','GET',base+'/venues?page=0&size=20',test='pm.test("Page contract", () => { const b=pm.response.json(); pm.expect(b.content).to.be.an("array"); pm.expect(b.totalElements).to.be.a("number"); });'),
 req('Get venue','GET',base+'/venues/{{venue_id}}'),
 req('Update venue','PUT',base+'/venues/{{venue_id}}',body={**venue,'name':'Postman Updated Hall'})
],auth=bearer('admin_access_token'))
folder('02 - Events (organizer)',[
 req('Create draft event','POST',base+'/events',201,body=eventbody,save='event_id',test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Created as DRAFT", () => pm.expect(b.status).to.eql("DRAFT"));
 pm.test("Organizer is JWT subject", () => pm.expect(b.organizerId).to.eql(pm.environment.get("organizer_sub")));
}'''),
 req('List own events','GET',base+'/events/me?page=0&size=20&status=DRAFT',test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Page contract", () => {
  pm.expect(b.content).to.be.an("array");
  pm.expect(b.totalElements).to.be.a("number");
 });
 pm.test("Events belong to current organizer", () => {
  const orgSub = pm.environment.get("organizer_sub");
  if (orgSub) {
   b.content.forEach(e => pm.expect(e.organizerId).to.eql(orgSub));
  }
 });
 pm.test("Filtered by DRAFT status", () => {
  b.content.forEach(e => pm.expect(e.status).to.eql("DRAFT"));
 });
}'''),
 req('List public events','GET',base+'/events?page=0&size=20',test='''if(pm.response.code === 200) pm.test("No private events in list", () => {
 pm.response.json().content.forEach(e => pm.expect(["PUBLISHED","ON_SALE","CLOSED"]).to.include(e.status));
});'''),
 req('Get own draft','GET',base+'/events/{{event_id}}'),
 req('Update own draft','PUT',base+'/events/{{event_id}}',body={**eventbody,'title':'Postman Updated Concert'})
],auth=bearer('organizer_access_token'))
folder('03 - Ticket tiers (organizer)',[
 req('Create ticket tier','POST',base+'/events/{{event_id}}/ticket-tiers',201,body=tier,save='tier_id'),
 req('List ticket tiers','GET',base+'/events/{{event_id}}/ticket-tiers'),
 req('Get ticket tier','GET',base+'/events/{{event_id}}/ticket-tiers/{{tier_id}}'),
 req('Update ticket tier','PUT',base+'/events/{{event_id}}/ticket-tiers/{{tier_id}}',body={**tier,'price':600000})
],auth=bearer('organizer_access_token'))
folder('04 - Seat sections & Seatmap (organizer)',[
 req('Create seat section','POST',base+'/events/{{event_id}}/sections',201,body=sectionbody,save='section_id',test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Section totalSeats calculated", () => pm.expect(b.totalSeats).to.eql(20));
}'''),
 req('List seat sections','GET',base+'/events/{{event_id}}/sections',test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Sections array", () => pm.expect(b).to.be.an("array"));
}'''),
 req('Get seat section','GET',base+'/events/{{event_id}}/sections/{{section_id}}'),
 req('Update seat section','PUT',base+'/events/{{event_id}}/sections/{{section_id}}',body={**sectionbody,'rowCount':3},test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Updated totalSeats", () => pm.expect(b.totalSeats).to.eql(30));
}'''),
 req('Get event seatmap','GET',base+'/events/{{event_id}}/seatmap',test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Seatmap has sections and seats", () => {
  pm.expect(b.sections).to.be.an("array").and.not.empty;
  pm.expect(b.sections[0].seats).to.be.an("array").and.not.empty;
  pm.expect(b.sections[0].seats[0].seatId).to.match(/^[A-Za-z0-9_-]+-\\d{2}-\\d{2}$/);
 });
}''')
],auth=bearer('organizer_access_token'))
folder('05 - Event lifecycle (organizer)',[
 req('Create lifecycle draft event','POST',base+'/events',201,body={**eventbody,'title':'Postman Lifecycle Concert'},save='lifecycle_event_id'),
 req('Create lifecycle tier','POST',base+'/events/{{lifecycle_event_id}}/ticket-tiers',201,body=tier,save='lifecycle_tier_id'),
 req('Create lifecycle section','POST',base+'/events/{{lifecycle_event_id}}/sections',201,body={'name':'LC','tierId':'{{lifecycle_tier_id}}','rowCount':2,'seatsPerRow':5},save='lifecycle_section_id'),
 req('Publish lifecycle event','POST',base+'/events/{{lifecycle_event_id}}/publish',200,test='''if (pm.response.code === 200) {
 pm.test("Event status is PUBLISHED", () => pm.expect(pm.response.json().status).to.eql("PUBLISHED"));
}'''),
 req('Open lifecycle event on-sale','PUT',base+'/events/{{lifecycle_event_id}}/on-sale',200,test='''if (pm.response.code === 200) {
 pm.test("Event status is ON_SALE", () => pm.expect(pm.response.json().status).to.eql("ON_SALE"));
}'''),
 req('Close lifecycle event','POST',base+'/events/{{lifecycle_event_id}}/close',200,test='''if (pm.response.code === 200) {
 pm.test("Event status is CLOSED", () => pm.expect(pm.response.json().status).to.eql("CLOSED"));
}'''),
 req('Create cancel draft event','POST',base+'/events',201,body={**eventbody,'title':'Postman Cancel Concert'},save='cancel_event_id'),
 req('Cancel draft event','POST',base+'/events/{{cancel_event_id}}/cancel',200,test='''if (pm.response.code === 200) {
 pm.test("Event status is CANCELLED", () => pm.expect(pm.response.json().status).to.eql("CANCELLED"));
}''')
],auth=bearer('organizer_access_token'))
folder('06 - Seat inventory (seats & hold)',[
 req('Initialize event seats','POST',base+'/events/{{event_id}}/seats/initialize',201,auth=bearer('organizer_access_token'),body={'seats':[{'seatId':'A-01-01','tierId':'{{tier_id}}'},{'seatId':'A-01-02','tierId':'{{tier_id}}'}]},test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Seats array returned", () => pm.expect(b).to.be.an("array").and.not.empty);
}'''),
 req('List event seats','GET',base+'/events/{{event_id}}/seats',auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Seats list returned", () => pm.expect(b).to.be.an("array"));
}'''),
 req('Hold seats','POST',base+'/events/{{event_id}}/seats/hold',200,auth=bearer('customer_access_token'),body={'seatIds':['A-01-01','A-01-02'],'bookingId':'{{booking_id}}','ttlSeconds':600},test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Hold success is true", () => pm.expect(b.success).to.be.true);
}'''),
 req('Release seats','POST',base+'/events/{{event_id}}/seats/release',204,auth=bearer('customer_access_token'),body={'seatIds':['A-01-01'],'bookingId':'{{booking_id}}'}),
 req('Confirm seats','POST',base+'/events/{{event_id}}/seats/confirm',204,auth=bearer('customer_access_token'),body={'seatIds':['A-01-02'],'bookingId':'{{booking_id}}'})
])
bookingbody={'eventId':'{{event_id}}','seats':[{'seatId':'A-01-01','tierId':'{{tier_id}}','price':500000}]}
folder('07 - Bookings (customer)',[
 req('Create booking','POST',base+'/bookings',201,auth=bearer('customer_access_token'),body=bookingbody,save='booking_id',pre='pm.request.headers.add({key: "Idempotency-Key", value: "pm-idemp-" + Date.now()});',test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Booking status is AWAITING_PAYMENT", () => pm.expect(b.status).to.eql("AWAITING_PAYMENT"));
}'''),
 req('List my bookings','GET',base+'/bookings/me?page=0&size=20',auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 const b = pm.response.json();
 pm.test("Page contract", () => {
  pm.expect(b.content).to.be.an("array");
  pm.expect(b.totalElements).to.be.a("number");
 });
}'''),
 req('Get booking','GET',base+'/bookings/{{booking_id}}',auth=bearer('customer_access_token')),
 req('Confirm booking','POST',base+'/bookings/{{booking_id}}/confirm',200,auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 pm.test("Booking status is CONFIRMED", () => pm.expect(pm.response.json().status).to.eql("CONFIRMED"));
}'''),
 req('Cancel booking','POST',base+'/bookings/{{booking_id}}/cancel',200,auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 pm.test("Booking status is CANCELLED", () => pm.expect(pm.response.json().status).to.eql("CANCELLED"));
}''')
])
folder('08 - Payments (customer)',[
 req('Create payment','POST',base+'/payments',201,auth=bearer('customer_access_token'),body={'bookingId':'{{booking_id}}','amount':500000,'description':'Ticket payment','provider':'MOCK'},save='payment_id',test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Payment status is PENDING", () => pm.expect(b.status).to.eql("PENDING"));
 pm.test("OrderCode is positive number", () => pm.expect(b.orderCode).to.be.above(0));
 if (b.orderCode) pm.environment.set("order_code", String(b.orderCode));
}'''),
 req('Get payment','GET',base+'/payments/{{payment_id}}',auth=bearer('customer_access_token')),
 req('Get payments by booking','GET',base+'/payments/by-booking/{{booking_id}}',auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 pm.test("Returns payments array", () => pm.expect(pm.response.json()).to.be.an("array"));
}'''),
 req('Payment webhook','POST',base+'/payments/webhook',200,auth=no,body={'orderCode':'{{order_code}}','amount':500000,'status':'PAID'},test='''if (pm.response.code === 200) {
 pm.test("Webhook returned error 0", () => pm.expect(pm.response.json().error).to.eql(0));
}'''),
 req('Simulate payment success','POST',base+'/payments/mock/simulate-success/{{order_code}}',200,auth=no,test='''if (pm.response.code === 200) {
 pm.test("Status changed to PAID", () => pm.expect(pm.response.json().status).to.eql("PAID"));
}''')
])
folder('09 - Tickets (customer & staff)',[
 req('Manual issue ticket','POST',base+'/tickets/manual-issue',201,auth=bearer('organizer_access_token'),body={'bookingId':'{{booking_id}}','eventId':'{{event_id}}','seatId':'seat-demo-01','seatCode':'A-01','tierName':'VIP','price':500000,'currency':'VND','userId':'{{customer_sub}}'},save='ticket_id',test='''if (pm.response.code === 201) {
 const b = pm.response.json();
 pm.test("Ticket code present", () => pm.expect(b.ticketCode).to.be.a("string"));
 if (b.ticketCode) pm.environment.set("ticket_code", b.ticketCode);
}'''),
 req('Get ticket by id','GET',base+'/tickets/{{ticket_id}}',auth=bearer('customer_access_token')),
 req('Get tickets by booking','GET',base+'/tickets/by-booking/{{booking_id}}',auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 pm.test("Returns tickets list", () => pm.expect(pm.response.json()).to.be.an("array"));
}'''),
 req('Get my tickets','GET',base+'/tickets/my-tickets',auth=bearer('customer_access_token'),test='''if (pm.response.code === 200) {
 pm.test("Returns user tickets list", () => pm.expect(pm.response.json()).to.be.an("array"));
}'''),
 req('Check in ticket','POST',base+'/tickets/check-in',200,auth=bearer('organizer_access_token'),body={'ticketCode':'{{ticket_code}}','deviceInfo':'GATE-DEMO-01'},test='''if (pm.response.code === 200) {
 pm.test("Check-in successful", () => pm.expect(pm.response.json().success).to.be.true);
 pm.test("Status is USED", () => pm.expect(pm.response.json().status).to.eql("USED"));
}''')
])
folder('10 - Security checks',[
 req('No token returns 401','GET',base+'/events',401,auth=no),
 req('Invalid token returns 401','GET',base+'/events',401,auth={'type':'bearer','bearer':[{'key':'token','value':'invalid-token','type':'string'}]}),
 req('Customer cannot create venue','POST',base+'/venues',403,auth=bearer('customer_access_token'),body=venue),
 req('Customer cannot create event','POST',base+'/events',403,auth=bearer('customer_access_token'),body=eventbody),
 req('Customer cannot list own events','GET',base+'/events/me',403,auth=bearer('customer_access_token')),
 req('Customer cannot read draft','GET',base+'/events/{{event_id}}',403,auth=bearer('customer_access_token')),
 req('Customer cannot list private tiers','GET',base+'/events/{{event_id}}/ticket-tiers',403,auth=bearer('customer_access_token')),
 req('Customer cannot read private tier','GET',base+'/events/{{event_id}}/ticket-tiers/{{tier_id}}',403,auth=bearer('customer_access_token')),
 req('Customer cannot create section','POST',base+'/events/{{event_id}}/sections',403,auth=bearer('customer_access_token'),body=sectionbody),
 req('Customer cannot list sections','GET',base+'/events/{{event_id}}/sections',403,auth=bearer('customer_access_token')),
 req('Customer cannot read draft seatmap','GET',base+'/events/{{event_id}}/seatmap',403,auth=bearer('customer_access_token')),
 req('Customer cannot edit draft','PUT',base+'/events/{{event_id}}',403,auth=bearer('customer_access_token'),body=eventbody),
 req('Customer cannot publish event','POST',base+'/events/{{event_id}}/publish',403,auth=bearer('customer_access_token')),
 req('Customer cannot open on-sale','PUT',base+'/events/{{event_id}}/on-sale',403,auth=bearer('customer_access_token')),
 req('Customer cannot close event','POST',base+'/events/{{event_id}}/close',403,auth=bearer('customer_access_token')),
 req('Customer cannot cancel event','POST',base+'/events/{{event_id}}/cancel',403,auth=bearer('customer_access_token')),
 req('Customer cannot initialize seats','POST',base+'/events/{{event_id}}/seats/initialize',403,auth=bearer('customer_access_token'),body={'seats':[{'seatId':'A-01-01','tierId':'{{tier_id}}'}]}),
 req('Customer cannot check in ticket','POST',base+'/tickets/check-in',403,auth=bearer('customer_access_token'),body={'ticketCode':'{{ticket_code}}'}),
 req('Other organizer cannot edit draft','PUT',base+'/events/{{event_id}}',403,auth=bearer('other_organizer_access_token'),body=eventbody,pre='if (!pm.environment.get("other_organizer_access_token")) pm.execution.skipRequest();',description='Optional: get a token for a different organizer account and set other_organizer_access_token.'),
 req('Invalid pagination returns 400','GET',base+'/events?size=101',400,auth=bearer('organizer_access_token'))
])
guard='if (pm.environment.get("enable_admin_registration") !== "true") pm.execution.skipRequest();'
folder('11 - Registration (optional admin provisioning)',[
 req('01 - Login Keycloak master admin','POST','{{keycloak_url}}/realms/master/protocol/openid-connect/token',auth=no,form={'grant_type':'password','client_id':'admin-cli','username':'{{keycloak_admin_username}}','password':'{{keycloak_admin_password}}'},test='''if (pm.response.code === 200) {
 const b=pm.response.json(); pm.expect(b.access_token).to.be.a("string");
 pm.environment.set("keycloak_admin_access_token", b.access_token);
}''',description='Local Keycloak administration only. Use KC_ADMIN_USERNAME/KC_ADMIN_PASSWORD, not admin01. Password grant applies only to master/admin-cli here; application login uses PKCE.'),
 req('02 - Create user (register via admin)','POST',admin+'/users',201,auth=bearer('keycloak_admin_access_token'),body={'username':'{{new_username}}','email':'{{new_email}}','firstName':'Postman','lastName':'Customer','enabled':True,'emailVerified':False,'credentials':[{'type':'password','value':'{{new_user_password}}','temporary':False}]},test='''if (pm.response.code === 201) {
 const location=pm.response.headers.get("Location");
 pm.test("Location contains new user id", () => pm.expect(location).to.be.a("string").and.not.empty);
 if(location) pm.environment.set("new_user_id", location.split("/").pop());
}''',description='Creates a persistent Keycloak account. Choose a new username/email for each run. Does not enable public signup or assign organizer/admin.'),
 req('03 - Read customer role','GET',admin+'/roles/customer',auth=bearer('keycloak_admin_access_token'),test='if(pm.response.code === 200) pm.environment.set("customer_role_id", pm.response.json().id);'),
 req('04 - Assign customer role','POST',admin+'/users/{{new_user_id}}/role-mappings/realm',204,auth=bearer('keycloak_admin_access_token'),body=[{'id':'{{customer_role_id}}','name':'customer'}]),
 req('05 - Verify customer role','GET',admin+'/users/{{new_user_id}}/role-mappings/realm',auth=bearer('keycloak_admin_access_token'),test='if(pm.response.code === 200) pm.test("Customer role assigned", () => pm.expect(pm.response.json().map(r=>r.name)).to.include("customer"));')
],'Self-registration is currently DISABLED (registrationAllowed=false); there is no /api/v1/auth/register. Set enable_admin_registration=true explicitly, fill local admin credentials and new user fields, then send 01-05 in order. Newly created users log in through the PKCE helper with their own credentials.')
for i in folders[-1]['item']:i['event'].insert(0,event('prerequest',guard))
folders[-1]['item'][0]['event'][0]['script']['exec'].append('else if (!pm.environment.get("keycloak_admin_username") || !pm.environment.get("keycloak_admin_password")) throw new Error("Fill local Keycloak master admin credentials first");')
folders[-1]['item'][1]['event'].insert(1,event('prerequest', '''if (pm.environment.get("enable_admin_registration") === "true") {
 for (const key of ["new_username", "new_email", "new_user_password"]) {
  if (!pm.environment.get(key)) throw new Error("Fill " + key + " first");
 }
 pm.request.body.update(JSON.stringify({
  username: pm.environment.get("new_username"), email: pm.environment.get("new_email"),
  firstName: "Postman", lastName: "Customer", enabled: true, emailVerified: false,
  credentials: [{type: "password", value: pm.environment.get("new_user_password"), temporary: false}]
 }));
}'''))
refresh=req('Refresh organizer token','POST',kc+'/token',auth=no,form={'grant_type':'refresh_token','client_id':'{{client_id}}','refresh_token':'{{organizer_refresh_token}}'},test='''if (pm.response.code === 200) {
 const b=pm.response.json(); pm.environment.set("organizer_access_token",b.access_token);
 if(b.refresh_token) pm.environment.set("organizer_refresh_token",b.refresh_token);
}''',description='Copy the organizer refresh_token from the PKCE token dialog into organizer_refresh_token first.',pre='if (!pm.environment.get("organizer_refresh_token")) pm.execution.skipRequest();')
logout=req('Logout organizer session','POST',kc+'/logout',204,auth=no,form={'client_id':'{{client_id}}','refresh_token':'{{organizer_refresh_token}}'},description='Ends the Keycloak session. Existing JWT access tokens can remain valid until expiry at resource servers.',test='''if(pm.response.code === 204) {
 pm.environment.unset("organizer_access_token"); pm.environment.unset("organizer_refresh_token");
}''',pre='if (pm.environment.get("enable_logout") !== "true") pm.execution.skipRequest();')
folder('12 - Refresh and logout (optional)',[refresh,logout])
folder('13 - Cleanup (optional, deletes test data)',[
 req('Delete seat section','DELETE',base+'/events/{{event_id}}/sections/{{section_id}}',204,auth=bearer('organizer_access_token')),
 req('Delete ticket tier','DELETE',base+'/events/{{event_id}}/ticket-tiers/{{tier_id}}',204,auth=bearer('organizer_access_token')),
 req('Delete draft event','DELETE',base+'/events/{{event_id}}',204,auth=bearer('organizer_access_token')),
 req('Delete venue','DELETE',base+'/venues/{{venue_id}}',204,auth=bearer('admin_access_token'))
],'Set enable_cleanup=true, then run in order after the other tests. Deletes the resources whose IDs are in the selected environment.')
for i in folders[-1]['item']:i['event'].insert(0,event('prerequest','if (pm.environment.get("enable_cleanup") !== "true") pm.execution.skipRequest();'))
for f in folders:
 for i in f['item']:
  pres = [e for e in i['event'] if e['listen'] == 'prerequest']
  if len(pres) > 1:
   joined = '\n'.join('\n'.join(e['script']['exec']) for e in pres)
   i['event'] = [event('prerequest', joined)] + [e for e in i['event'] if e['listen'] != 'prerequest']
collection={'info':{'_postman_id':str(uuid.uuid5(uuid.NAMESPACE_URL, 'ticketnow-postman-collection')),'name':'TicketNow - Current APIs + Keycloak','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json','description':'All 46 current Event, Seat Inventory, Booking, Payment & Ticket Service operations through Gateway, interactive Keycloak PKCE, security checks, refresh/logout and optional admin account provisioning. Import the companion environment and read README.md. No public self-registration API exists; registrationAllowed is false. No live operations were run when generating this file.'},'item':folders}
env={'base_url':'http://localhost:8080','keycloak_url':'http://localhost:8180','realm':'ticketnow','client_id':'ticketnow-postman','callback_url':'https://oauth.pstmn.io/v1/callback','starts_at':'2026-12-20T12:00:00Z','ends_at':'2026-12-20T15:00:00Z','venue_id':'','event_id':'','tier_id':'','section_id':'','lifecycle_event_id':'','lifecycle_tier_id':'','lifecycle_section_id':'','cancel_event_id':'','booking_id':'bkg-demo-001','payment_id':'','order_code':'123456','ticket_id':'','ticket_code':'','admin_access_token':'','organizer_access_token':'','customer_access_token':'','other_organizer_access_token':'','admin_sub':'','organizer_sub':'','customer_sub':'','organizer_refresh_token':'','enable_admin_registration':'false','keycloak_admin_username':'','keycloak_admin_password':'','keycloak_admin_access_token':'','new_username':'','new_email':'','new_user_password':'','new_user_id':'','customer_role_id':'','enable_cleanup':'false','enable_logout':'false'}
secrets={k for k in env if 'token' in k or 'password' in k}
environment={'id':str(uuid.uuid5(uuid.NAMESPACE_URL, 'ticketnow-postman-local-environment')),'name':'TicketNow - Local','values':[{'key':k,'value':v,'enabled':True,'type':'secret' if k in secrets else 'default'} for k,v in env.items()],'_postman_variable_scope':'environment'}
(out/'TicketNow.postman_collection.json').write_text(json.dumps(collection,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'TicketNow.local.postman_environment.json').write_text(json.dumps(environment,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Created collection:',sum(len(f['item']) for f in folders),'requests; 46 business operations covered')
