import json, uuid
from pathlib import Path
out=Path('postman')
def event(kind,script): return {'listen':kind,'script':{'type':'text/javascript','exec':script.splitlines()}}
def bearer(key): return {'type':'bearer','bearer':[{'key':'token','value':'{{'+key+'}}','type':'string'}]}
def oauth(role):
 d={'grant_type':'authorization_code_with_pkce','authUrl':'{{keycloak_url}}/realms/{{realm}}/protocol/openid-connect/auth','accessTokenUrl':'{{keycloak_url}}/realms/{{realm}}/protocol/openid-connect/token','clientId':'{{client_id}}','clientSecret':'','redirect_uri':'{{callback_url}}','scope':'openid profile email','challengeAlgorithm':'S256','client_authentication':'body','addTokenTo':'header','tokenName':'ticketnow-'+role,'accessToken':'{{'+role+'_access_token}}','useBrowser':False}
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
folder('04 - Security checks',[
 req('No token returns 401','GET',base+'/events',401,auth=no),
 req('Invalid token returns 401','GET',base+'/events',401,auth={'type':'bearer','bearer':[{'key':'token','value':'invalid-token','type':'string'}]}),
 req('Customer cannot create venue','POST',base+'/venues',403,auth=bearer('customer_access_token'),body=venue),
 req('Customer cannot create event','POST',base+'/events',403,auth=bearer('customer_access_token'),body=eventbody),
 req('Customer cannot list own events','GET',base+'/events/me',403,auth=bearer('customer_access_token')),
 req('Customer cannot read draft','GET',base+'/events/{{event_id}}',403,auth=bearer('customer_access_token')),
 req('Customer cannot list private tiers','GET',base+'/events/{{event_id}}/ticket-tiers',403,auth=bearer('customer_access_token')),
 req('Customer cannot read private tier','GET',base+'/events/{{event_id}}/ticket-tiers/{{tier_id}}',403,auth=bearer('customer_access_token')),
 req('Customer cannot edit draft','PUT',base+'/events/{{event_id}}',403,auth=bearer('customer_access_token'),body=eventbody),
 req('Other organizer cannot edit draft','PUT',base+'/events/{{event_id}}',403,auth=bearer('other_organizer_access_token'),body=eventbody,pre='if (!pm.environment.get("other_organizer_access_token")) pm.execution.skipRequest();',description='Optional: get a token for a different organizer account and set other_organizer_access_token.'),
 req('Invalid pagination returns 400','GET',base+'/events?size=101',400,auth=bearer('organizer_access_token'))
])
guard='if (pm.environment.get("enable_admin_registration") !== "true") pm.execution.skipRequest();'
folder('05 - Registration (optional admin provisioning)',[
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
folder('06 - Refresh and logout (optional)',[refresh,logout])
folder('07 - Cleanup (optional, deletes test data)',[
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
collection={'info':{'_postman_id':str(uuid.uuid5(uuid.NAMESPACE_URL, 'ticketnow-postman-collection')),'name':'TicketNow - Current APIs + Keycloak','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json','description':'All 16 current Event Service operations through Gateway, interactive Keycloak PKCE, security checks, refresh/logout and optional admin account provisioning. Import the companion environment and read README.md. No public self-registration API exists; registrationAllowed is false. No live operations were run when generating this file.'},'item':folders}
env={'base_url':'http://localhost:8080','keycloak_url':'http://localhost:8180','realm':'ticketnow','client_id':'ticketnow-postman','callback_url':'https://oauth.pstmn.io/v1/callback','starts_at':'2026-12-20T12:00:00Z','ends_at':'2026-12-20T15:00:00Z','venue_id':'','event_id':'','tier_id':'','admin_access_token':'','organizer_access_token':'','customer_access_token':'','other_organizer_access_token':'','admin_sub':'','organizer_sub':'','customer_sub':'','organizer_refresh_token':'','enable_admin_registration':'false','keycloak_admin_username':'','keycloak_admin_password':'','keycloak_admin_access_token':'','new_username':'','new_email':'','new_user_password':'','new_user_id':'','customer_role_id':'','enable_cleanup':'false','enable_logout':'false'}
secrets={k for k in env if 'token' in k or 'password' in k}
environment={'id':str(uuid.uuid5(uuid.NAMESPACE_URL, 'ticketnow-postman-local-environment')),'name':'TicketNow - Local','values':[{'key':k,'value':v,'enabled':True,'type':'secret' if k in secrets else 'default'} for k,v in env.items()],'_postman_variable_scope':'environment'}
(out/'TicketNow.postman_collection.json').write_text(json.dumps(collection,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'TicketNow.local.postman_environment.json').write_text(json.dumps(environment,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Created collection:',sum(len(f['item']) for f in folders),'requests; 16 business operations covered')
