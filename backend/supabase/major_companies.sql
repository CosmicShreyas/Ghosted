-- Major-company catalogue for Ghosted.
-- Safe to run repeatedly in the Supabase SQL Editor: existing slugs or domains are skipped.
-- Catalogue rows are platform-provided, so created_by intentionally remains null.

begin;

with source(name, domain, industry, hq_city, founded, summary) as (
 values
  ('Accenture','accenture.com','consulting','Dublin',1989,'Global professional services company providing technology, operations and consulting services.'),
  ('Anthropic','anthropic.com','software','San Francisco',2021,'Artificial intelligence company researching and building reliable and interpretable AI systems.'),
  ('Deloitte','deloitte.com','consulting','London',1845,'Global professional services organization providing audit, consulting, tax and advisory services.'),
  ('Infosys','infosys.com','it_services','Bengaluru',1981,'Global technology consulting and digital services company headquartered in Bengaluru.'),
  ('Tata Consultancy Services','tcs.com','it_services','Mumbai',1968,'Global IT services, consulting and business solutions company within the Tata Group.'),
  ('Wipro','wipro.com','it_services','Bengaluru',1945,'Technology services and consulting company serving businesses across global markets.'),
  ('HCLTech','hcltech.com','it_services','Noida',1976,'Global technology company providing engineering, cloud, software and digital services.'),
  ('Tech Mahindra','techmahindra.com','it_services','Pune',1986,'Technology consulting and digital solutions company within the Mahindra Group.'),
  ('LTIMindtree','ltimindtree.com','it_services','Mumbai',1996,'Global technology consulting and digital solutions company within Larsen and Toubro.'),
  ('Mphasis','mphasis.com','it_services','Bengaluru',1998,'Information technology services company focused on cloud and cognitive transformation.'),
  ('Persistent Systems','persistent.com','it_services','Pune',1990,'Digital engineering and enterprise modernization company serving global organizations.'),
  ('Cognizant','cognizant.com','it_services','Teaneck',1994,'Global professional services company focused on technology and business modernization.'),
  ('Capgemini','capgemini.com','consulting','Paris',1967,'Global consulting, technology services and digital transformation company.'),
  ('IBM','ibm.com','software','Armonk',1911,'Global technology company providing hybrid cloud, artificial intelligence and consulting services.'),
  ('Oracle','oracle.com','software','Austin',1977,'Enterprise software and cloud infrastructure company known for database technologies.'),
  ('SAP','sap.com','software','Walldorf',1972,'Enterprise software company providing business applications and cloud platforms.'),
  ('Salesforce','salesforce.com','software','San Francisco',1999,'Cloud software company focused on customer relationship management and business applications.'),
  ('ServiceNow','servicenow.com','software','Santa Clara',2004,'Cloud software company providing digital workflows for enterprises and public organizations.'),
  ('Adobe','adobe.com','software','San Jose',1982,'Software company building creative, document and digital experience products.'),
  ('Google','google.com','software','Mountain View',1998,'Technology company building internet services, cloud platforms, devices and artificial intelligence products.'),
  ('Microsoft','microsoft.com','software','Redmond',1975,'Technology company building software, cloud services, devices and artificial intelligence products.'),
  ('Apple','apple.com','software','Cupertino',1976,'Technology company designing consumer electronics, software and digital services.'),
  ('Amazon','amazon.com','ecommerce','Seattle',1994,'Global technology company operating e-commerce, cloud computing and digital services businesses.'),
  ('Meta','meta.com','software','Menlo Park',2004,'Technology company building social platforms, communication products and virtual reality systems.'),
  ('NVIDIA','nvidia.com','software','Santa Clara',1993,'Computing company designing accelerated hardware and software for graphics and artificial intelligence.'),
  ('Intel','intel.com','manufacturing','Santa Clara',1968,'Semiconductor company designing processors, platforms and computing technologies.'),
  ('Cisco','cisco.com','telecom','San Jose',1984,'Technology company providing networking, security, collaboration and observability products.'),
  ('Siemens','siemens.com','manufacturing','Munich',1847,'Global technology company focused on industrial automation, infrastructure and mobility.'),
  ('Bosch','bosch.com','manufacturing','Gerlingen',1886,'Global engineering and technology company serving mobility, industrial and consumer markets.'),
  ('Samsung','samsung.com','manufacturing','Suwon',1969,'Global electronics company producing devices, semiconductors, displays and digital appliances.'),
  ('Dell Technologies','dell.com','manufacturing','Round Rock',1984,'Technology company providing computers, infrastructure, storage and enterprise solutions.'),
  ('Qualcomm','qualcomm.com','manufacturing','San Diego',1985,'Semiconductor and telecommunications company developing wireless computing technologies.'),
  ('McKinsey & Company','mckinsey.com','consulting','New York',1926,'Global management consulting firm advising organizations across industries and functions.'),
  ('Boston Consulting Group','bcg.com','consulting','Boston',1963,'Global management consulting firm working with businesses, governments and social organizations.'),
  ('Bain & Company','bain.com','consulting','Boston',1973,'Global management consulting firm advising companies on strategy, operations and transformation.'),
  ('PwC','pwc.com','consulting','London',1998,'Global professional services network providing assurance, consulting and tax services.'),
  ('EY','ey.com','consulting','London',1989,'Global professional services organization providing assurance, consulting, strategy and tax services.'),
  ('KPMG','kpmg.com','consulting','Amstelveen',1987,'Global professional services network providing audit, tax and advisory services.'),
  ('JPMorgan Chase','jpmorganchase.com','bfsi','New York',2000,'Global financial services firm providing banking, markets, payments and asset management services.'),
  ('Goldman Sachs','goldmansachs.com','bfsi','New York',1869,'Global financial institution providing investment banking, markets and asset management services.'),
  ('Morgan Stanley','morganstanley.com','bfsi','New York',1935,'Global financial services firm focused on securities, wealth and investment management.'),
  ('HSBC','hsbc.com','bfsi','London',1865,'International banking and financial services organization serving individuals and businesses.'),
  ('Barclays','barclays.com','bfsi','London',1896,'Global bank providing consumer, corporate and investment banking services.'),
  ('Deutsche Bank','db.com','bfsi','Frankfurt',1870,'International bank providing corporate, investment, private and retail banking services.'),
  ('American Express','americanexpress.com','bfsi','New York',1850,'Global payments company providing cards, merchant services and travel-related products.'),
  ('Visa','visa.com','fintech','San Francisco',1958,'Global payments technology company connecting consumers, businesses and financial institutions.'),
  ('Mastercard','mastercard.com','fintech','Purchase',1966,'Global payments technology company providing transaction processing and digital payment services.'),
  ('State Bank of India','sbi.co.in','bfsi','Mumbai',1955,'Indian public sector bank providing retail, corporate and international financial services.'),
  ('HDFC Bank','hdfcbank.com','bfsi','Mumbai',1994,'Indian private sector bank providing retail, wholesale and digital banking services.'),
  ('ICICI Bank','icicibank.com','bfsi','Mumbai',1994,'Indian private sector bank offering retail, corporate and digital financial services.'),
  ('Axis Bank','axisbank.com','bfsi','Mumbai',1993,'Indian private sector bank serving retail, small business and corporate customers.'),
  ('Kotak Mahindra Bank','kotak.com','bfsi','Mumbai',1985,'Indian financial services group providing banking, investment and insurance products.'),
  ('Razorpay','razorpay.com','fintech','Bengaluru',2014,'Indian financial technology company providing payments and banking tools for businesses.'),
  ('Paytm','paytm.com','fintech','Noida',2010,'Indian digital payments and financial services company serving consumers and merchants.'),
  ('PhonePe','phonepe.com','fintech','Bengaluru',2015,'Indian digital payments and financial services platform serving consumers and merchants.'),
  ('Flipkart','flipkart.com','ecommerce','Bengaluru',2007,'Indian e-commerce marketplace offering consumer products, logistics and digital services.'),
  ('Myntra','myntra.com','ecommerce','Bengaluru',2007,'Indian fashion and lifestyle e-commerce platform serving consumers across the country.'),
  ('Meesho','meesho.com','ecommerce','Bengaluru',2015,'Indian e-commerce marketplace connecting consumers, sellers and small businesses.'),
  ('Swiggy','swiggy.com','ecommerce','Bengaluru',2014,'Indian on-demand convenience platform for food delivery, groceries and local services.'),
  ('Zomato','zomato.com','ecommerce','Gurugram',2008,'Indian food technology platform offering restaurant discovery and delivery services.'),
  ('Uber','uber.com','logistics','San Francisco',2009,'Technology platform connecting people with mobility, delivery and logistics services.'),
  ('Ola','olacabs.com','logistics','Bengaluru',2010,'Indian mobility platform providing ride-hailing and related transportation services.'),
  ('Reliance Industries','ril.com','other','Mumbai',1973,'Indian conglomerate operating across energy, retail, telecommunications and digital services.'),
  ('Jio Platforms','jio.com','telecom','Mumbai',2019,'Indian digital services company operating telecommunications, apps and technology platforms.'),
  ('Bharti Airtel','airtel.com','telecom','New Delhi',1995,'Telecommunications company providing mobile, broadband and enterprise connectivity services.'),
  ('Vodafone Idea','myvi.in','telecom','Mumbai',2018,'Indian telecommunications company providing mobile voice, data and enterprise services.'),
  ('Tata Motors','tatamotors.com','manufacturing','Mumbai',1945,'Indian automotive manufacturer producing passenger, commercial and electric vehicles.'),
  ('Mahindra & Mahindra','mahindra.com','manufacturing','Mumbai',1945,'Indian multinational group active in automobiles, farm equipment and technology services.'),
  ('Larsen & Toubro','larsentoubro.com','manufacturing','Mumbai',1938,'Indian multinational engaged in engineering, construction, manufacturing and technology services.'),
  ('Maruti Suzuki','marutisuzuki.com','manufacturing','New Delhi',1981,'Indian automobile manufacturer producing and selling passenger vehicles across the country.'),
  ('Zoho','zoho.com','software','Chennai',1996,'Indian software company building cloud applications for businesses and organizations.'),
  ('Freshworks','freshworks.com','software','San Mateo',2010,'Software company providing customer support, IT service and business engagement products.'),
  ('Atlassian','atlassian.com','software','Sydney',2002,'Software company building collaboration, project management and developer tools.'),
  ('Walmart Global Tech','tech.walmart.com','ecommerce','Bentonville',2005,'Technology organization building digital commerce, supply chain and retail platforms for Walmart.'),
  ('Target','target.com','ecommerce','Minneapolis',1902,'Retail company operating stores, digital commerce and technology teams across global markets.'),
  ('Wells Fargo','wellsfargo.com','bfsi','San Francisco',1852,'Financial services company providing banking, lending, payments and wealth management.'),
  ('Bank of America','bankofamerica.com','bfsi','Charlotte',1998,'Global financial institution serving individuals, businesses and institutional clients.'),
  ('Standard Chartered','sc.com','bfsi','London',1969,'International banking group serving corporate, institutional and retail customers.'),
  ('Amdocs','amdocs.com','it_services','Chesterfield',1982,'Software and services company supporting communications, media and financial providers.'),
  ('Genpact','genpact.com','consulting','New York',1997,'Professional services company focused on data, technology and business process transformation.'),
  ('Concentrix','concentrix.com','it_services','Newark',1983,'Global technology and services company focused on customer experience and business operations.'),
  ('Teleperformance','teleperformance.com','it_services','Paris',1978,'Global digital business services company providing customer experience and operational support.'),
  ('Nagarro','nagarro.com','it_services','Munich',1996,'Digital engineering company building software products and technology solutions for enterprises.'),
  ('EPAM Systems','epam.com','it_services','Newtown',1993,'Digital engineering and consulting company delivering software and transformation services.')
),
prepared as (
  select
    trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as slug,
    name,
    domain,
    'https://' || domain as website,
    industry,
    hq_city,
    founded,
    summary,
    summary || ' This verified catalog entry helps candidates find and share hiring experiences connected to the correct organization.' as about,
    (array['bg-logo-violet','bg-logo-coral','bg-logo-blue','bg-logo-green','bg-logo-pink','bg-logo-amber','bg-logo-red'])
      [1 + ((row_number() over (order by name) - 1) % 7)::int] as color
  from source
)
insert into public.companies (
  slug, name, color, summary, created_by, domain, website, logo_url, about,
  industry, size, hq_city, founded, careers_url, status
)
select
  slug, name, color, summary, null, domain, website,
  'https://unavatar.io/' || domain || '?fallback=false', about,
  industry, '5000+', hq_city, founded, null, 'listed'
from prepared
on conflict do nothing;


-- High-growth and startup employers frequently encountered by Indian candidates.
with startup_source(name, domain, industry, size, hq_city, founded, summary) as (
 values
  ('Vibgyor Interiors','vibgyorinteriors.com','other','51-200','Bengaluru',1975,'Bengaluru interior design company providing home interiors, renovation, manufacturing and automation services.'),
  ('Headout','headout.com','ecommerce','201-1000','New York',2014,'Travel technology company helping people discover and book experiences in cities around the world.'),
  ('Rippling','rippling.com','software','1001-5000','San Francisco',2016,'Business software company unifying human resources, information technology and finance operations.'),
  ('BrowserStack','browserstack.com','software','1001-5000','Mumbai',2011,'Cloud testing platform helping developers test websites and mobile applications across devices.'),
  ('Postman','postman.com','software','1001-5000','San Francisco',2014,'API development platform helping teams design, test, document and manage application interfaces.'),
  ('Hasura','hasura.io','software','201-1000','San Francisco',2017,'Software company providing data access and GraphQL infrastructure for application developers.'),
  ('Chargebee','chargebee.com','software','1001-5000','Chennai',2011,'Subscription management and revenue operations platform serving businesses around the world.'),
  ('Druva','druva.com','software','1001-5000','Santa Clara',2008,'Cloud data security company providing backup, recovery and governance services for enterprises.'),
  ('InMobi','inmobi.com','media','1001-5000','Singapore',2007,'Advertising technology company helping brands and publishers engage mobile audiences.'),
  ('CRED','cred.club','fintech','1001-5000','Bengaluru',2018,'Indian financial technology platform offering payments, credit and member-focused financial products.'),
  ('Zerodha','zerodha.com','fintech','1001-5000','Bengaluru',2010,'Indian financial services company providing online investing and trading platforms.'),
  ('Groww','groww.in','fintech','1001-5000','Bengaluru',2016,'Indian investment platform offering stocks, mutual funds and other financial products.'),
  ('Zepto','zeptonow.com','ecommerce','1001-5000','Mumbai',2021,'Indian quick-commerce company delivering groceries and everyday products through a digital platform.'),
  ('Blinkit','blinkit.com','ecommerce','1001-5000','Gurugram',2013,'Indian quick-commerce platform delivering groceries and daily essentials to consumers.'),
  ('Urban Company','urbancompany.com','ecommerce','1001-5000','Gurugram',2014,'Indian marketplace connecting consumers with trained professionals for services at home.'),
  ('Delhivery','delhivery.com','logistics','5000+','Gurugram',2011,'Indian logistics and supply-chain company serving e-commerce and enterprise customers.'),
  ('Porter','porter.in','logistics','1001-5000','Bengaluru',2014,'Indian logistics platform providing intra-city delivery and commercial vehicle services.'),
  ('Udaan','udaan.com','ecommerce','1001-5000','Bengaluru',2016,'Indian business-to-business commerce platform connecting retailers, wholesalers and manufacturers.'),
  ('OYO','oyo.com','other','5000+','Gurugram',2012,'Hospitality technology company providing accommodation and operational tools across global markets.'),
  ('MakeMyTrip','makemytrip.com','ecommerce','5000+','Gurugram',2000,'Indian online travel company offering flights, hotels, holidays and transportation bookings.'),
  ('Dream11','dream11.com','gaming','1001-5000','Mumbai',2008,'Indian fantasy sports platform offering skill-based contests across multiple sports.'),
  ('Games24x7','games24x7.com','gaming','1001-5000','Mumbai',2006,'Indian digital gaming company building skill games and casual entertainment products.'),
  ('Mobile Premier League','mpl.live','gaming','1001-5000','Bengaluru',2018,'Mobile gaming and esports platform offering competitive and casual digital games.'),
  ('Practo','practo.com','healthtech','1001-5000','Bengaluru',2008,'Indian health technology platform connecting patients, doctors, clinics and diagnostic providers.'),
  ('Tata 1mg','1mg.com','healthtech','1001-5000','Gurugram',2015,'Indian digital healthcare platform providing medicines, diagnostics and online consultations.'),
  ('PharmEasy','pharmeasy.in','healthtech','1001-5000','Mumbai',2015,'Indian digital healthcare company offering medicines, diagnostics and pharmacy services.'),
  ('cult.fit','cult.fit','healthtech','1001-5000','Bengaluru',2016,'Indian health and fitness company operating digital services and physical fitness centres.'),
  ('Ather Energy','atherenergy.com','manufacturing','1001-5000','Bengaluru',2013,'Indian electric vehicle company designing scooters, charging infrastructure and connected software.'),
  ('Ola Electric','olaelectric.com','manufacturing','5000+','Bengaluru',2017,'Indian electric mobility company designing and manufacturing electric two-wheelers and related technology.'),
  ('boAt','boat-lifestyle.com','manufacturing','1001-5000','Gurugram',2016,'Indian consumer electronics company offering audio products, wearables and accessories.'),
  ('Lenskart','lenskart.com','ecommerce','5000+','Gurugram',2010,'Indian eyewear company operating online services, retail stores and manufacturing facilities.'),
  ('Nykaa','nykaa.com','ecommerce','5000+','Mumbai',2012,'Indian consumer technology company selling beauty, wellness and fashion products online and in stores.'),
  ('Policybazaar','policybazaar.com','fintech','5000+','Gurugram',2008,'Indian insurance technology marketplace helping consumers compare and purchase financial protection products.'),
  ('Pine Labs','pinelabs.com','fintech','1001-5000','Noida',1998,'Financial technology company providing merchant commerce, payments and credit solutions.'),
  ('BharatPe','bharatpe.com','fintech','1001-5000','New Delhi',2018,'Indian financial technology company offering payment acceptance and financial services to merchants.'),
  ('CoinDCX','coindcx.com','fintech','201-1000','Mumbai',2018,'Indian digital asset platform providing cryptocurrency trading and related financial technology services.'),
  ('CoinSwitch','coinswitch.co','fintech','201-1000','Bengaluru',2017,'Indian financial technology platform providing digital asset and investment products.'),
  ('Slice','sliceit.com','fintech','1001-5000','Bengaluru',2016,'Indian financial technology company building consumer payment, credit and banking products.'),
  ('Navi','navi.com','fintech','1001-5000','Bengaluru',2018,'Indian financial services company offering lending, insurance and investment products through technology.'),
  ('Juspay','juspay.in','fintech','1001-5000','Bengaluru',2012,'Payments technology company building checkout, authentication and payment orchestration infrastructure.'),
  ('Niyo','goniyo.com','fintech','201-1000','Bengaluru',2015,'Indian financial technology company offering digital banking and travel-focused financial products.'),
  ('KreditBee','kreditbee.in','fintech','1001-5000','Bengaluru',2018,'Indian financial technology platform providing personal credit and other consumer finance products.'),
  ('ShareChat','sharechat.com','media','1001-5000','Bengaluru',2015,'Indian social media company building multilingual community and short-video platforms.'),
  ('Dailyhunt','dailyhunt.com','media','1001-5000','Bengaluru',2009,'Indian content technology company providing news and entertainment in multiple languages.'),
  ('Inshorts','inshorts.com','media','201-1000','Noida',2013,'Indian news technology company delivering concise news and location-based content products.'),
  ('Pocket FM','pocketfm.com','media','1001-5000','Bengaluru',2018,'Audio entertainment company producing serialized fiction and spoken-word content for global audiences.'),
  ('apna','apna.co','software','1001-5000','Bengaluru',2019,'Indian jobs and professional networking platform serving frontline and skilled workers.'),
  ('Info Edge','infoedge.in','software','5000+','Noida',1995,'Indian internet company operating recruitment, real estate, matrimony and education platforms.'),
  ('Darwinbox','darwinbox.com','software','1001-5000','Hyderabad',2015,'Cloud human capital management platform serving enterprises across multiple regions.'),
  ('Whatfix','whatfix.com','software','1001-5000','San Jose',2014,'Digital adoption platform helping organizations guide users through enterprise software.'),
  ('LeadSquared','leadsquared.com','software','1001-5000','Bengaluru',2011,'Sales execution and marketing automation platform serving consumer-facing businesses.'),
  ('CleverTap','clevertap.com','software','1001-5000','Mountain View',2013,'Customer engagement platform helping digital businesses analyze, personalize and automate communications.'),
  ('MoEngage','moengage.com','software','1001-5000','San Francisco',2014,'Customer engagement platform helping consumer brands personalize communications across digital channels.'),
  ('WebEngage','webengage.com','software','201-1000','Mumbai',2011,'Customer data and engagement platform helping businesses automate personalized communication.'),
  ('Yellow.ai','yellow.ai','software','1001-5000','San Mateo',2016,'Conversational artificial intelligence company building automated customer service and employee experiences.'),
  ('Gupshup','gupshup.io','software','1001-5000','San Francisco',2004,'Conversational messaging platform helping businesses communicate with customers across digital channels.'),
  ('Exotel','exotel.com','telecom','1001-5000','Bengaluru',2011,'Cloud communications company providing contact centre, voice and messaging infrastructure.'),
  ('Uniphore','uniphore.com','software','1001-5000','Palo Alto',2008,'Enterprise artificial intelligence company building conversational and automation products.'),
  ('Fractal','fractal.ai','software','5000+','New York',2000,'Artificial intelligence and analytics company helping enterprises make data-driven decisions.'),
  ('Mu Sigma','mu-sigma.com','consulting','1001-5000','Chicago',2004,'Data analytics and decision sciences company serving large global enterprises.'),
  ('Tredence','tredence.com','consulting','1001-5000','San Jose',2013,'Data science and artificial intelligence company providing analytics solutions to enterprises.'),
  ('Quantiphi','quantiphi.com','consulting','5000+','Marlborough',2013,'Artificial intelligence engineering company building cloud and data solutions for enterprises.'),
  ('Zeta','zeta.tech','fintech','1001-5000','Bengaluru',2015,'Banking technology company providing payment processing and digital banking infrastructure.'),
  ('Open Financial Technologies','open.money','fintech','201-1000','Bengaluru',2017,'Indian business banking platform offering payments, accounting and financial management tools.'),
  ('Cashfree Payments','cashfree.com','fintech','1001-5000','Bengaluru',2015,'Indian payments company providing collections, payouts and banking infrastructure for businesses.'),
  ('Perfios','perfios.com','fintech','1001-5000','Bengaluru',2008,'Financial technology company providing data, decisioning and lending automation products.'),
  ('OfBusiness','ofbusiness.com','fintech','1001-5000','Gurugram',2015,'Indian business platform providing industrial commerce and financing services to small enterprises.'),
  ('Infra.Market','infra.market','ecommerce','1001-5000','Thane',2016,'Indian construction materials platform serving businesses through technology and private-label products.'),
  ('Livspace','livspace.com','other','5000+','Bengaluru',2014,'Home interiors company providing design, renovation and project execution through a digital platform.'),
  ('HomeLane','homelane.com','other','1001-5000','Bengaluru',2014,'Indian home interiors company providing personalized design and installation services.'),
  ('NoBroker','nobroker.in','other','1001-5000','Bengaluru',2014,'Indian property technology platform connecting owners, tenants, buyers and service providers.'),
  ('CARS24','cars24.com','ecommerce','5000+','Gurugram',2015,'Automotive technology platform enabling people to buy, sell and finance used vehicles.'),
  ('Spinny','spinny.com','ecommerce','1001-5000','Gurugram',2015,'Indian automotive marketplace providing inspected used cars and related ownership services.'),
  ('Physics Wallah','pw.live','edtech','5000+','Noida',2020,'Indian education technology company providing online and offline learning programs.'),
  ('Unacademy','unacademy.com','edtech','1001-5000','Bengaluru',2015,'Indian education technology platform offering courses and test preparation programs.'),
  ('upGrad','upgrad.com','edtech','5000+','Mumbai',2015,'Education technology company providing higher education and professional learning programs.'),
  ('Simplilearn','simplilearn.com','edtech','1001-5000','Bengaluru',2010,'Digital learning company providing professional certification and technology training programs.'),
  ('Scaler','scaler.com','edtech','1001-5000','Bengaluru',2019,'Education technology company providing software engineering and data science career programs.'),
  ('Great Learning','mygreatlearning.com','edtech','1001-5000','Gurugram',2013,'Professional learning company offering technology, business and higher education programs.')
),
startup_prepared as (
  select
    trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as slug,
    name, domain, 'https://' || domain as website, industry, size, hq_city, founded, summary,
    summary || ' This catalog entry helps candidates find and share hiring experiences connected to the correct organization.' as about,
    (array['bg-logo-violet','bg-logo-coral','bg-logo-blue','bg-logo-green','bg-logo-pink','bg-logo-amber','bg-logo-red'])
      [1 + ((row_number() over (order by name) - 1) % 7)::int] as color
  from startup_source
)
insert into public.companies (
  slug, name, color, summary, created_by, domain, website, logo_url, about,
  industry, size, hq_city, founded, careers_url, status
)
select
  slug, name, color, summary, null, domain, website,
  'https://unavatar.io/' || domain || '?fallback=false', about,
  industry, size, hq_city, founded, null, 'listed'
from startup_prepared
on conflict do nothing;


-- Existing catalogue rows may predate logo seeding or carry the former low-resolution favicon.
-- The frontend receives these images through Ghosted's backend logo proxy.
update public.companies
set logo_url = 'https://unavatar.io/' || domain || '?fallback=false'
where domain is not null
  and (logo_url is null or logo_url like 'https://icons.duckduckgo.com/%');

commit;
