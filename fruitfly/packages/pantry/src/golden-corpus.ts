export interface GoldenDoc { title: string; kind: 'markdown' | 'plain' | 'csv'; text: string }
export interface GoldenQuestion { q: string; doc?: string; /** evidence substring that must appear in the retrieved passages */ expect?: string; absent?: boolean }

const lease = `# Residential Rental Agreement

This agreement is made on 28 March 2025 between Mr. Rajesh Kulkarni (the Landlord) and Ms. Asha Rao (the Tenant) for the flat at 14 Lakeview Apartments, Baner, Pune 411045.

## Term
The tenancy runs for eleven (11) months starting 1 April 2025 and ending 29 February 2026. It may be renewed by mutual written consent with a rent increase of not more than 5 percent.

## Rent and payment
The monthly rent is Rs. 32,000 (thirty-two thousand rupees) payable on or before the 5th day of each month by bank transfer to the Landlord's account. A late fee of Rs. 100 per day applies after the 10th of the month.

## Security deposit
The Tenant has paid an interest-free refundable security deposit of Rs. 96,000, equal to three months of rent. The deposit will be returned within 30 days after vacating, less any proven damage beyond normal wear and tear.

## Maintenance and utilities
Society maintenance charges of Rs. 2,500 per month are borne by the Tenant. Electricity, water and piped gas are billed on actual usage and paid by the Tenant directly to the providers.

## Repairs
Minor repairs costing less than Rs. 1,000 (bulbs, taps, switches) are the Tenant's responsibility. Structural repairs, plumbing behind walls and waterproofing are the Landlord's responsibility.

## Notice and termination
Either party may end the tenancy by giving two (2) months' written notice. If the Tenant leaves earlier without notice, the Landlord may deduct one month's rent from the deposit.

## Pets and subletting
Pets are not allowed without the Landlord's written consent. Subletting or sharing the flat with unrelated persons is prohibited.

## Parking and access
One covered two-wheeler parking slot (number B-14) is included. The Landlord may inspect the flat with 24 hours' notice.

## Governing law
This agreement is governed by the laws of Maharashtra. Disputes will be settled in the courts of Pune.`;

const invoices = `invoice_id,vendor,date,amount_inr,status,description
INV-3001,Croma,2025-07-04,48990,paid,Acer Aspire laptop 16GB
INV-3002,Airtel Xstream,2025-07-10,1179,paid,Broadband 100 Mbps monthly plan
INV-3003,Urban Company,2025-07-15,899,paid,Deep cleaning bathroom service
INV-3004,IndiGo,2025-07-22,6420,paid,Flight Pune to Delhi one way
INV-3005,Apollo Pharmacy,2025-08-02,1345,paid,Prescription medicines
INV-3006,Airtel Xstream,2025-08-10,1179,paid,Broadband 100 Mbps monthly plan
INV-3007,Decathlon,2025-08-14,3799,paid,Trekking shoes and rain jacket
INV-3008,MSEDCL,2025-08-18,2210,overdue,Electricity bill July
INV-3009,Amazon,2025-08-29,2499,paid,Noise cancelling headphones
INV-3010,Bigbasket,2025-09-03,3120,paid,Monthly groceries
INV-3011,Airtel Xstream,2025-09-10,1179,paid,Broadband 100 Mbps monthly plan
INV-3012,Lakeview Society,2025-09-12,7500,pending,Maintenance for three months
INV-3013,Dr. Mehta Dental,2025-09-19,4200,paid,Dental cleaning and X-ray
INV-3014,MSEDCL,2025-09-20,2480,pending,Electricity bill August
INV-3015,Zerodha,2025-09-25,354,paid,Annual account maintenance charge
INV-3016,Cult.fit,2025-09-28,5400,paid,Quarterly gym membership`;

const japan = `# Japan trip, November 2025

## Flights
Outbound: Air India AI 306 from Mumbai (BOM) to Tokyo Narita (NRT), departing 12 November at 23:55, arriving 13 November 10:20. Return: AI 307 from Tokyo Narita on 24 November at 11:40. Booking reference is KX7P2Q. Seat 34A both ways.

## Hotels
- Tokyo: Sakura Stay Shinjuku, 6 nights from 13 November, 14,500 yen per night, breakfast not included.
- Kyoto: Machiya Guesthouse Gion, 4 nights from 19 November, 18,200 yen per night with breakfast.
- Osaka: Hotel Namba Grand, 2 nights from 23 November, 11,800 yen per night.

## Transport
A 7-day Japan Rail Pass costs 50,000 yen and should be activated at Tokyo station on 17 November for the trip to Kyoto. Buy a Suica card at the airport for local trains in Tokyo.

## Visa and documents
Indian passport holders need a tourist visa. The application at the Japan Visa Centre in Mumbai took 5 working days. Carry printed hotel bookings and the return ticket. Passport is valid until 2031.

## Food notes
Asha is allergic to peanuts and prefers vegetarian meals. Look for the Jain-friendly restaurants near Gion. Try the okonomiyaki in Osaka without bonito flakes.

## Budget
Total budget is Rs. 2,40,000 including flights of Rs. 78,000 and hotels of about Rs. 85,000. Daily spending allowance is 9,000 yen.

## Packing
Light rain jacket, universal adapter (Japan uses type A plugs, 100 volts), power bank, comfortable walking shoes, a small umbrella and offline maps downloaded.

## Emergency
Indian Embassy in Tokyo: +81 3 3262 2391. Travel insurance policy number TI-884213 with 24 hour helpline.`;

const policy = `HEALTH INSURANCE POLICY SUMMARY

POLICY DETAILS
Policy number HP-2025-778120 issued to Asha Rao. The policy period is 1 June 2025 to 31 May 2026. The sum insured is Rs. 5,00,000 on a family floater basis covering two adults.

PREMIUM
Annual premium is Rs. 14,820 including GST, payable once a year. A grace period of 30 days applies after the renewal date of 1 June.

WAITING PERIODS
An initial waiting period of 30 days applies for all illnesses except accidents. Pre-existing diseases are covered after a waiting period of 24 months. Specific procedures such as cataract and hernia have a waiting period of 24 months.

ROOM RENT AND CO-PAYMENT
Room rent is capped at 1 percent of the sum insured per day, which is Rs. 5,000 per day. A co-payment of 10 percent applies to claims for insured persons older than 60 years.

CASHLESS TREATMENT
Cashless hospitalisation is available at network hospitals. Intimate the insurer at least 48 hours before planned admission and within 24 hours for emergencies. The helpline is 1800 266 0000.

CLAIM PROCESS
For reimbursement claims, submit the claim form, original bills, discharge summary and investigation reports within 15 days of discharge.

EXCLUSIONS
Cosmetic surgery, dental treatment unless caused by an accident, infertility treatment and war related injuries are not covered.

NO CLAIM BONUS
A bonus of 10 percent of the sum insured is added for every claim free year up to a maximum of 50 percent.`;

function handbook(): string {
  const topics: [string, string][] = [
    ['Leave policy', 'Full time employees receive 24 days of paid leave per year, accrued at two days a month. Up to 8 unused days carry forward. Sick leave is separate at 10 days per year and needs a medical certificate after 3 consecutive days.'],
    ['Work from home', 'Employees may work from home up to three days a week with manager approval. Core collaboration hours are 11:00 to 16:00 Indian Standard Time. Home office equipment allowance is Rs. 15,000 once every three years.'],
    ['Expense reimbursement', 'Submit expenses within 30 days with receipts. Meals while travelling are reimbursed up to Rs. 1,500 per day. Taxi rides above Rs. 500 need a short justification. Alcohol is never reimbursed.'],
    ['Business travel', 'Domestic flights are economy class. International flights over 6 hours may use premium economy with director approval. Hotels are capped at Rs. 9,000 per night in metro cities and Rs. 6,000 elsewhere.'],
    ['Laptop refresh', 'Laptops are replaced every 4 years or earlier if the repair cost exceeds half the replacement value. Request a refresh through the IT portal under Hardware.'],
    ['Notice period', 'The standard notice period is 60 days. Employees in their probation of 3 months may leave with 15 days notice. Garden leave may be applied at the company discretion.'],
    ['Performance reviews', 'Reviews happen twice a year, in April and October. Ratings use a five point scale. Promotion cycles follow the October review.'],
    ['Health benefits', 'The company provides group health cover of Rs. 3,00,000 per employee including parents. Annual health check-up is free at partner clinics.'],
    ['Learning budget', 'Each employee gets a learning budget of Rs. 40,000 per year for courses, books and conferences. Unused budget does not carry over.'],
    ['Information security', 'Use the password manager, enable two factor authentication and never share credentials. Report lost devices to security within one hour. Public Wi-Fi requires the company VPN.'],
  ];
  const filler = Array.from({ length: 26 }, (_, i) => `## Office guideline ${i + 1}\nGuideline ${i + 1} covers routine matters for floor ${(i % 6) + 1}, such as booking meeting room ${String.fromCharCode(65 + (i % 8))}${i + 11}, visitor registration at desk ${(i % 5) + 1}, pantry etiquette for shift ${(i % 3) + 1} and recycling of paper, plastic and electronics. Facilities request number FR-${1000 + i * 7}. Please keep common areas tidy and report issues to the front desk team.`);
  return `# Employee Handbook\n\nWelcome to Brightwell Labs. This handbook explains how we work.\n\n${topics.map(([h, t]) => `## ${h}\n${t}`).join('\n\n')}\n\n${filler.join('\n\n')}`;
}

export const GOLDEN_DOCS: GoldenDoc[] = [
  { title: 'Lease-2025', kind: 'markdown', text: lease },
  { title: 'Invoices-Q3', kind: 'csv', text: invoices },
  { title: 'Japan-Trip-Notes', kind: 'markdown', text: japan },
  { title: 'Health-Insurance-Policy', kind: 'plain', text: policy },
  { title: 'Employee-Handbook', kind: 'markdown', text: handbook() },
];

export const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  // lease
  { q: 'How much is my monthly rent?', doc: 'Lease-2025', expect: 'Rs. 32,000' },
  { q: 'What is the security deposit on my flat and when is it returned?', doc: 'Lease-2025', expect: 'Rs. 96,000' },
  { q: 'How many months of notice do I need to give my landlord?', doc: 'Lease-2025', expect: 'two (2) months' },
  { q: 'Can I keep a dog in my apartment?', doc: 'Lease-2025', expect: 'Pets are not allowed' },
  { q: 'What is the late fee for paying rent after the 10th?', doc: 'Lease-2025', expect: 'Rs. 100 per day' },
  { q: 'When does my tenancy end?', doc: 'Lease-2025', expect: '29 February 2026' },
  { q: 'Who is responsible for repairs under 1000 rupees?', doc: 'Lease-2025', expect: 'Tenant\'s responsibility' },
  { q: 'Which parking slot do I have?', doc: 'Lease-2025', expect: 'B-14' },
  { q: 'How much society maintenance do I pay each month?', doc: 'Lease-2025', expect: 'Rs. 2,500' },
  // invoices
  { q: 'How much did I pay Croma for the laptop?', doc: 'Invoices-Q3', expect: '48990' },
  { q: 'Which electricity bills are still pending or overdue?', doc: 'Invoices-Q3', expect: 'MSEDCL' },
  { q: 'What did I spend at Decathlon?', doc: 'Invoices-Q3', expect: 'Trekking shoes' },
  { q: 'How much is my monthly Airtel broadband bill?', doc: 'Invoices-Q3', expect: '1179' },
  { q: 'What was my dental invoice?', doc: 'Invoices-Q3', expect: 'Dr. Mehta Dental' },
  { q: 'Did I pay the society maintenance for three months?', doc: 'Invoices-Q3', expect: 'Lakeview Society' },
  { q: 'What did the Pune to Delhi flight cost?', doc: 'Invoices-Q3', expect: '6420' },
  // travel
  { q: 'What time does my flight to Tokyo depart?', doc: 'Japan-Trip-Notes', expect: '23:55' },
  { q: 'What is my flight booking reference?', doc: 'Japan-Trip-Notes', expect: 'KX7P2Q' },
  { q: 'How much does the Kyoto guesthouse cost per night?', doc: 'Japan-Trip-Notes', expect: '18,200 yen' },
  { q: 'How much is the JR Pass and when should I activate it?', doc: 'Japan-Trip-Notes', expect: '50,000 yen' },
  { q: 'What am I allergic to when eating in Japan?', doc: 'Japan-Trip-Notes', expect: 'peanuts' },
  { q: 'What is the total budget for the Japan trip?', doc: 'Japan-Trip-Notes', expect: '2,40,000' },
  { q: 'What plug type does Japan use?', doc: 'Japan-Trip-Notes', expect: 'type A' },
  { q: 'What is the travel insurance policy number for the trip?', doc: 'Japan-Trip-Notes', expect: 'TI-884213' },
  // policy
  { q: 'What is the sum insured in my health policy?', doc: 'Health-Insurance-Policy', expect: 'Rs. 5,00,000' },
  { q: 'How long is the waiting period for pre-existing diseases?', doc: 'Health-Insurance-Policy', expect: '24 months' },
  { q: 'What is the room rent limit per day?', doc: 'Health-Insurance-Policy', expect: 'Rs. 5,000 per day' },
  { q: 'When must I inform the insurer before planned hospital admission?', doc: 'Health-Insurance-Policy', expect: '48 hours' },
  { q: 'What is my annual premium?', doc: 'Health-Insurance-Policy', expect: 'Rs. 14,820' },
  { q: 'Is dental treatment covered by my insurance?', doc: 'Health-Insurance-Policy', expect: 'dental treatment' },
  // handbook
  { q: 'How many days of paid leave do I get per year?', doc: 'Employee-Handbook', expect: '24 days' },
  { q: 'How many days a week can I work from home?', doc: 'Employee-Handbook', expect: 'three days a week' },
  { q: 'What is the hotel cap per night for business travel in metro cities?', doc: 'Employee-Handbook', expect: 'Rs. 9,000 per night' },
  { q: 'What is the company notice period?', doc: 'Employee-Handbook', expect: '60 days' },
  { q: 'How much is the yearly learning budget?', doc: 'Employee-Handbook', expect: 'Rs. 40,000' },
  { q: 'When are performance reviews held?', doc: 'Employee-Handbook', expect: 'April and October' },
  { q: 'How often are laptops replaced at work?', doc: 'Employee-Handbook', expect: '4 years' },
  // absent: the documents say nothing about these
  { q: 'What is my blood group?', absent: true },
  { q: 'How much did I pay for my car insurance?', absent: true },
  { q: 'What is the name of my landlord\'s lawyer?', absent: true },
  { q: 'Which hotel did I book in Seoul?', absent: true },
  { q: 'What is my PAN card number?', absent: true },
  { q: 'When is my daughter\'s school fee due?', absent: true },
];
