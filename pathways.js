/* ═══════════════════════════════════════════════════════════════════════
   pathways.js — static reference data.

   Regulatory bodies, pathway step templates, and draft document templates.
   This is plain data: it describes the world, it does not reason about it.
   All reasoning lives in agent.js behind getAgentReasoning().

   Step structure is shared across regions within a country; the labels and
   authorities are swapped per region so the pathway names the body the
   applicant will actually deal with.
   ═══════════════════════════════════════════════════════════════════════ */

var CB = window.CB || {};
window.CB = CB;

/* ISO 3166 regions, for the 'country trained in' field. Display only:
   it is recorded on the case file and never drives the pathway. */
CB.COUNTRIES = [
    "Afghanistan", "Åland Islands", "Albania", "Algeria", "American Samoa", "Andorra",
    "Angola", "Anguilla", "Antigua & Barbuda", "Argentina", "Armenia", "Aruba", "Australia",
    "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus",
    "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia & Herzegovina",
    "Botswana", "Brazil", "British Virgin Islands", "Brunei", "Bulgaria", "Burkina Faso",
    "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Caribbean Netherlands",
    "Cayman Islands", "Central African Republic", "Chad", "Chile", "China", "Colombia",
    "Comoros", "Congo - Brazzaville", "Congo - Kinshasa", "Cook Islands", "Costa Rica",
    "Côte d’Ivoire", "Croatia", "Cuba", "Curaçao", "Cyprus", "Czechia", "Denmark",
    "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Falkland Islands",
    "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia",
    "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland",
    "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea", "Guinea-Bissau",
    "Guyana", "Haiti", "Honduras", "Hong Kong SAR China", "Hungary", "Iceland", "India",
    "Indonesia", "Iran", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Jamaica",
    "Japan", "Jersey", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait",
    "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
    "Liechtenstein", "Lithuania", "Luxembourg", "Macao SAR China", "Madagascar", "Malawi",
    "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania",
    "Mauritius", "Mayotte", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
    "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar (Burma)", "Namibia",
    "Nauru", "Nepal", "Netherlands", "New Caledonia", "New Zealand", "Nicaragua", "Niger",
    "Nigeria", "Niue", "North Korea", "North Macedonia", "Northern Mariana Islands",
    "Norway", "Oman", "Pakistan", "Palau", "Palestinian Territories", "Panama",
    "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
    "Puerto Rico", "Qatar", "Réunion", "Romania", "Russia", "Rwanda", "Samoa", "San Marino",
    "São Tomé & Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
    "Sierra Leone", "Singapore", "Sint Maarten", "Slovakia", "Slovenia", "Solomon Islands",
    "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
    "St. Barthélemy", "St. Helena", "St. Kitts & Nevis", "St. Lucia", "St. Martin",
    "St. Pierre & Miquelon", "St. Vincent & Grenadines", "Sudan", "Suriname", "Sweden",
    "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
    "Togo", "Tokelau", "Tonga", "Trinidad & Tobago", "Tunisia", "Türkiye", "Turkmenistan",
    "Turks & Caicos Islands", "Tuvalu", "U.S. Virgin Islands", "Uganda", "Ukraine",
    "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
    "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Wallis & Futuna", "Western Sahara",
    "Yemen", "Zambia", "Zimbabwe"
];

CB.REGIONS = {
  'Canada': ['Ontario', 'British Columbia', 'Alberta'],
  'United States': ['New York', 'California', 'Texas']
};

/* Regional regulators and assessment services. */
CB.BODIES = {
  'Ontario': {
    short: 'Ontario',
    nursing: 'College of Nurses of Ontario',
    nursingIntake: 'National Nursing Assessment Service (NNAS)',
    medical: 'College of Physicians and Surgeons of Ontario',
    engineering: 'Professional Engineers Ontario',
    teaching: 'Ontario College of Teachers',
    evalAgency: 'World Education Services (WES) Canada',
    teacherEval: 'World Education Services (WES) Canada'
  },
  'British Columbia': {
    short: 'B.C.',
    nursing: 'B.C. College of Nurses and Midwives',
    nursingIntake: 'National Nursing Assessment Service (NNAS)',
    medical: 'College of Physicians and Surgeons of British Columbia',
    engineering: 'Engineers and Geoscientists British Columbia',
    teaching: 'B.C. Teacher Certification Branch',
    evalAgency: 'International Credential Evaluation Service (ICES)',
    teacherEval: 'International Credential Evaluation Service (ICES)'
  },
  'Alberta': {
    short: 'Alberta',
    nursing: 'College of Registered Nurses of Alberta',
    nursingIntake: 'National Nursing Assessment Service (NNAS)',
    medical: 'College of Physicians and Surgeons of Alberta',
    engineering: 'APEGA',
    teaching: 'Alberta Education, Office of the Registrar',
    evalAgency: 'International Qualifications Assessment Service (IQAS)',
    teacherEval: 'International Qualifications Assessment Service (IQAS)'
  },
  'New York': {
    short: 'New York',
    nursing: 'New York State Board of Nursing, NYSED Office of the Professions',
    medical: 'New York State Board for Medicine',
    engineering: 'New York State Board for Engineering and Land Surveying',
    teaching: 'NYSED Office of Teaching Initiatives',
    teacherExam: 'New York State Teacher Certification Examinations (NYSTCE)',
    evalAgency: 'a NACES-member evaluation service'
  },
  'California': {
    short: 'California',
    nursing: 'California Board of Registered Nursing',
    medical: 'Medical Board of California',
    engineering: 'California Board for Professional Engineers, Land Surveyors and Geologists',
    teaching: 'California Commission on Teacher Credentialing',
    teacherExam: 'CBEST and the CSET subject-matter examinations',
    evalAgency: 'a NACES-member evaluation service'
  },
  'Texas': {
    short: 'Texas',
    nursing: 'Texas Board of Nursing',
    medical: 'Texas Medical Board',
    engineering: 'Texas Board of Professional Engineers and Land Surveyors',
    teaching: 'Texas Education Agency, State Board for Educator Certification',
    teacherExam: 'the TExES certification examinations',
    evalAgency: 'a NACES-member evaluation service'
  }
};

/* Documents that arrive with every case file in this demo. */
CB.DOCUMENTS = [
  { id: 'eval',        name: 'Credential evaluation report' },
  { id: 'language',    name: 'Language proficiency test' },
  { id: 'transcripts', name: 'Academic transcripts, sealed' },
  { id: 'practice',    name: 'Proof of practice hours' }
];

/* ── Pathway templates ────────────────────────────────────────────────
   Each returns an ordered array of steps.
     id        stable key, referenced by conflict + rejection rules
     title     what the applicant has to do
     authority who adjudicates it
     detail    one line of plain-language context
     months    rough duration, summed for the estimated timeline
   Initial statuses are assigned by CB.buildPathway().
   ─────────────────────────────────────────────────────────────────── */
CB.PATHWAYS = {
  'Registered Nurse': {
    'Canada': function (b) {
      return [
        { id: 'eval', title: 'Credential evaluation', authority: b.evalAgency + ' via ' + b.nursingIntake,
          detail: 'Nursing education assessed against the Canadian entry-to-practice standard. Advisory report goes to the college.', months: 4 },
        { id: 'language', title: 'English language proficiency', authority: 'IELTS Academic',
          detail: 'Minimum band scores across all four skills. Results are valid for two years from the test date.', months: 2 },
        { id: 'bridging', title: 'Bridging program', authority: 'Approved ' + b.short + ' bridging provider',
          detail: 'Classroom and clinical placement covering the competency gaps named in the evaluation report.', months: 8 },
        { id: 'nclex', title: 'NCLEX-RN examination', authority: 'NCSBN, seat booked through ' + b.nursing,
          detail: 'Computer-adaptive licensure exam. The college issues the authorisation to test.', months: 3 },
        { id: 'registration', title: 'Registration as an RN', authority: b.nursing,
          detail: 'Jurisprudence exam, criminal record check, and the certificate of registration.', months: 3 }
      ];
    },
    'United States': function (b) {
      return [
        { id: 'eval', title: 'Credential evaluation', authority: 'CGFNS Credentials Evaluation Service',
          detail: 'Course-by-course report confirming your nursing education is comparable to a U.S. program.', months: 4 },
        { id: 'nclex', title: 'NCLEX-RN examination', authority: 'NCSBN, authorised by the ' + b.nursing,
          detail: 'The board issues an authorisation to test valid for 90 days. You schedule inside that window.', months: 3 },
        { id: 'licensure', title: 'State licensure by examination', authority: b.nursing,
          detail: 'Application, fingerprinting, and background check reviewed alongside the exam result.', months: 3 },
        { id: 'visascreen', title: 'VisaScreen certificate', authority: 'CGFNS International',
          detail: 'Required for the occupational visa. Confirms education, licence, English, and exam standing.', months: 3 }
      ];
    }
  },

  'Doctor / Physician': {
    'Canada': function (b) {
      return [
        { id: 'verify', title: 'Source verification of medical credentials', authority: 'Medical Council of Canada, physiciansapply.ca',
          detail: 'Degree and licence verified directly with the issuing institution and regulator.', months: 5 },
        { id: 'mccqe1', title: 'MCCQE Part I', authority: 'Medical Council of Canada',
          detail: 'Full-day examination of medical knowledge and clinical decision making.', months: 4 },
        { id: 'nac', title: 'NAC Examination', authority: 'Medical Council of Canada',
          detail: 'Objective structured clinical exam. Offered in a small number of sittings each year.', months: 4 },
        { id: 'carms', title: 'Residency match', authority: 'CaRMS R-1 main residency match',
          detail: 'File review, interviews, and rank order list. One match cycle per year.', months: 7 },
        { id: 'licence', title: 'Provincial licensure', authority: b.medical,
          detail: 'Postgraduate training, certification, and the register entry that lets you practise.', months: 6 }
      ];
    },
    'United States': function (b) {
      return [
        { id: 'ecfmg', title: 'ECFMG certification', authority: 'Educational Commission for Foreign Medical Graduates',
          detail: 'Primary-source verification of your medical school credentials plus exam standing.', months: 5 },
        { id: 'step1', title: 'USMLE Step 1', authority: 'USMLE, FSMB and NBME',
          detail: 'Pass or fail examination of foundational science as applied to practice.', months: 4 },
        { id: 'step2', title: 'USMLE Step 2 CK', authority: 'USMLE, FSMB and NBME',
          detail: 'Clinical knowledge examination. Scores are released on a fixed reporting calendar.', months: 4 },
        { id: 'match', title: 'Residency match', authority: 'ERAS application and the NRMP Match',
          detail: 'Applications, interviews, and rank order list. One match cycle per year.', months: 8 },
        { id: 'step3', title: 'USMLE Step 3', authority: 'USMLE, FSMB and NBME',
          detail: 'Two-day examination usually taken during the first year of residency.', months: 4 },
        { id: 'licence', title: 'State medical licensure', authority: b.medical,
          detail: 'Training verification, background check, and the licence to practise unsupervised.', months: 6 }
      ];
    }
  },

  'Civil Engineer': {
    'Canada': function (b) {
      return [
        { id: 'eval', title: 'Academic credential assessment', authority: b.engineering,
          detail: 'Your degree is compared against the Canadian Engineering Accreditation Board syllabus.', months: 4 },
        { id: 'application', title: 'Application for licensure', authority: b.engineering,
          detail: 'Academic file, references, and character review. An open file has a fixed validity period.', months: 2 },
        { id: 'exams', title: 'Confirmatory technical examinations', authority: b.engineering,
          detail: 'Assigned where the assessment finds gaps. Offered in a small number of sittings a year.', months: 8 },
        { id: 'nppe', title: 'National Professional Practice Exam', authority: 'NPPE, administered for ' + b.engineering,
          detail: 'Law, ethics, and professional practice. Written year-round at a testing centre.', months: 2 },
        { id: 'experience', title: 'Supervised engineering experience', authority: 'Validated by ' + b.engineering,
          detail: 'Forty-eight months of progressive experience, at least twelve of them in Canada.', months: 48 },
        { id: 'peng', title: 'P.Eng designation', authority: b.engineering,
          detail: 'Experience interview, final review, and the licence to seal engineering work.', months: 3 }
      ];
    },
    'United States': function (b) {
      return [
        { id: 'eval', title: 'Credentials evaluation', authority: 'NCEES Credentials Evaluations',
          detail: 'Your degree is measured against the accredited U.S. engineering curriculum.', months: 4 },
        { id: 'fe', title: 'FE Civil examination', authority: 'NCEES',
          detail: 'Computer-based fundamentals exam. Scheduled year-round in testing windows.', months: 3 },
        { id: 'eit', title: 'Engineer in Training certification', authority: b.engineering,
          detail: 'Board recognition of the FE pass. Starts the clock on qualifying experience.', months: 2 },
        { id: 'experience', title: 'Progressive engineering experience', authority: 'Verified by a licensed PE',
          detail: 'Forty-eight months under the responsible charge of a licensed professional engineer.', months: 48 },
        { id: 'pe', title: 'PE Civil examination', authority: 'NCEES, approved by ' + b.engineering,
          detail: 'Principles and practice exam. The board must approve your seat before you register.', months: 4 },
        { id: 'licensure', title: 'Professional Engineer licensure', authority: b.engineering,
          detail: 'Final board review, any state-specific examinations, and the seal.', months: 4 }
      ];
    }
  },

  'Teacher': {
    'Canada': function (b) {
      return [
        { id: 'eval', title: 'Credential evaluation', authority: b.teacherEval,
          detail: 'Degree and teacher education program assessed for Canadian equivalency.', months: 3 },
        { id: 'application', title: 'Application for certification', authority: b.teaching,
          detail: 'Transcripts sent directly by your institution, plus proof of good standing.', months: 4 },
        { id: 'language', title: 'Language proficiency', authority: 'IELTS or CELPIP, accepted by ' + b.teaching,
          detail: 'Required where your program was not delivered in English or French. Valid two years.', months: 2 },
        { id: 'practicum', title: 'Supervised practicum', authority: 'Placement approved by ' + b.teaching,
          detail: 'Assigned where the evaluation finds a practicum gap. Runs on the school-year intake.', months: 5 },
        { id: 'certificate', title: 'Teaching certificate issued', authority: b.teaching,
          detail: 'Criminal record check, registration fee, and entry on the public register.', months: 2 }
      ];
    },
    'United States': function (b) {
      return [
        { id: 'eval', title: 'Foreign transcript evaluation', authority: b.evalAgency,
          detail: 'Course-by-course report establishing degree equivalency and teacher preparation.', months: 3 },
        { id: 'exams', title: 'Certification examinations', authority: b.teacherExam,
          detail: 'Basic skills and subject-matter tests required before a credential can be issued.', months: 4 },
        { id: 'background', title: 'Fingerprint and background clearance', authority: b.teaching,
          detail: 'State and federal check. Clearance has to be live when the credential is adjudicated.', months: 2 },
        { id: 'licensure', title: 'Teaching credential issued', authority: b.teaching,
          detail: 'Final review of coursework, exams, and clearance, then the credential is posted.', months: 3 }
      ];
    }
  },

  /* Deliberately short. Software engineering is not a licensed profession
     in any of these regions, so the pathway is about work authorisation. */
  'Software Engineer': {
    'Canada': function (b) {
      return [
        { id: 'eval', title: 'Educational Credential Assessment', authority: 'World Education Services, for IRCC',
          detail: 'Immigration equivalency only. No engineering regulator is involved in a software role.', months: 3 },
        { id: 'language', title: 'Language test for Express Entry', authority: 'IELTS General Training or CELPIP',
          detail: 'Scores feed your Comprehensive Ranking System points. Valid two years from the test date.', months: 2 },
        { id: 'workauth', title: 'Work permit or permanent residence', authority: 'Immigration, Refugees and Citizenship Canada',
          detail: 'Express Entry profile, or an employer-supported permit. This is the only gate to practice.', months: 8 }
      ];
    },
    'United States': function (b) {
      return [
        { id: 'eval', title: 'Degree equivalency evaluation', authority: b.evalAgency,
          detail: 'Supports the visa petition. No state licensing board regulates software engineering.', months: 3 },
        { id: 'employer', title: 'Employer petition package', authority: 'Sponsoring employer, filed with USCIS',
          detail: 'Job offer, wage determination, and the specialty-occupation evidence.', months: 4 },
        { id: 'workauth', title: 'Visa or status filing', authority: 'USCIS and the Department of State',
          detail: 'H-1B, TN, O-1, or a change of status. This is the only gate to practice.', months: 7 }
      ];
    }
  }
};

/* Where the applicant trained, as one display string. Region is only ever
   present when they trained somewhere we hold regions for. */
CB.trainedInLabel = function (profile) {
  return profile.trainedInRegion
    ? profile.trainedInRegion + ', ' + profile.trainedIn
    : profile.trainedIn;
};

/* Build the initial pathway for a profile, with opening statuses applied. */
CB.buildPathway = function (profile) {
  var byCountry = CB.PATHWAYS[profile.profession];
  var body = CB.BODIES[profile.region];
  var steps = byCountry[profile.country](body).map(function (step) {
    return Object.assign({}, step, { status: 'not-started', blockedBy: null, flag: null });
  });

  /* The applicant is already partway in: first step done, second underway. */
  if (steps[0]) steps[0].status = 'complete';
  if (steps[1]) steps[1].status = 'in-progress';
  if (steps[2]) steps[2].status = 'upcoming';

  return steps;
};

/* Is this pathway a licensing pathway at all? */
CB.isRegulated = function (profile) {
  return profile.profession !== 'Software Engineer';
};

/* ── Draft documents ──────────────────────────────────────────────────
   Two per case: the regulator-facing statement, and a letter to whoever
   the applicant needs on side next.
   ─────────────────────────────────────────────────────────────────── */
CB.getDrafts = function (profile, today) {
  var b = CB.BODIES[profile.region];
  var name = profile.name;
  var trained = CB.trainedInLabel(profile);
  var region = profile.region;
  var date = today;

  var regulator = {
    'Registered Nurse': b.nursing,
    'Doctor / Physician': b.medical,
    'Civil Engineer': b.engineering,
    'Teacher': b.teaching,
    'Software Engineer': profile.country === 'Canada'
      ? 'Immigration, Refugees and Citizenship Canada'
      : 'the sponsoring employer'
  }[profile.profession];

  var roleWord = {
    'Registered Nurse': 'registered nurse',
    'Doctor / Physician': 'physician',
    'Civil Engineer': 'civil engineer',
    'Teacher': 'teacher',
    'Software Engineer': 'software engineer'
  }[profile.profession];

  var secondTitle = {
    'Registered Nurse': 'Cover letter — bridging program placement',
    'Doctor / Physician': 'Personal statement — residency application',
    'Civil Engineer': 'Cover letter — supervised experience placement',
    'Teacher': 'Cover letter — school district application',
    'Software Engineer': 'Cover letter — employer sponsorship'
  }[profile.profession];

  var secondTo = {
    'Registered Nurse': 'Admissions, ' + region + ' internationally educated nurse bridging program',
    'Doctor / Physician': 'Program Director, postgraduate medical education',
    'Civil Engineer': 'Engineering Manager, ' + region,
    'Teacher': 'Human Resources, ' + region + ' school district',
    'Software Engineer': 'Hiring Manager'
  }[profile.profession];

  var statement =
    date + '\n\n' +
    'To: ' + regulator + '\n' +
    'Re: Application by ' + name + ', internationally educated ' + roleWord + '\n\n' +
    'To the registrar,\n\n' +
    'I am applying for recognition to practise as a ' + roleWord + ' in ' + region + '. I completed my ' +
    'professional education in ' + trained + ' and have practised there since qualifying.\n\n' +
    'Enclosed with this application:\n' +
    '  1. Credential evaluation report, issued in my name and sent directly by the assessing service.\n' +
    '  2. Sealed academic transcripts, forwarded by the issuing institution.\n' +
    '  3. Evidence of language proficiency at or above the required band in all four skills.\n' +
    '  4. Letters confirming my practice hours and standing with my current regulator in ' + trained + '.\n\n' +
    'I understand that ' + regulator + ' may require further examination or supervised practice before ' +
    'recognition is granted, and I am ready to complete whatever the assessment identifies.\n\n' +
    'I would be grateful if you would confirm receipt and let me know of any document that has not arrived ' +
    'in the form you need it.\n\n' +
    'Yours faithfully,\n' +
    name + '\n' +
    'Trained in ' + trained + '\n';

  var letterBodyByProfession = {
    'Registered Nurse':
      'My credential evaluation identifies the competency areas I need to close before registration, and your ' +
      'bridging program is the route ' + b.nursing + ' recognises for that. I am looking for a place in the ' +
      'next intake and can begin clinical placement immediately on acceptance.',
    'Doctor / Physician':
      'I am applying to your program through the residency match. My credentials have been verified at source, ' +
      'and I am working through the licensing examinations on the schedule set out in my application. I have ' +
      'practised in ' + trained + ' since qualifying and want to continue that work here.',
    'Civil Engineer':
      'I need forty-eight months of progressive engineering experience under a licensed engineer before ' +
      b.engineering + ' will grant my licence, and at least part of it has to be gained here. I am looking for ' +
      'a role where that experience can be supervised and validated.',
    'Teacher':
      'My credential evaluation is complete and my application to ' + b.teaching + ' is open. I am looking for ' +
      'a classroom position for the coming school year and can supply references from my current school in ' +
      trained + '.',
    'Software Engineer':
      'Software engineering is not a licensed profession here, so there is no registration standing between me ' +
      'and the role. What I need is work authorisation. My degree has been evaluated for immigration purposes ' +
      'and my file is otherwise complete.'
  };

  var letter =
    date + '\n\n' +
    'To: ' + secondTo + '\n' +
    'From: ' + name + '\n\n' +
    'Dear colleagues,\n\n' +
    'I am an internationally educated ' + roleWord + ', trained in ' + trained + ' and now settling in ' +
    region + '.\n\n' +
    letterBodyByProfession[profile.profession] + '\n\n' +
    'My case file, including the credential evaluation and supporting documents, is ready to share on request. ' +
    'I would welcome the chance to talk about how my experience fits what you need.\n\n' +
    'With thanks,\n' +
    name + '\n';

  return [
    {
      id: 'statement',
      title: 'Application statement — ' + regulator,
      meta: 'Drafted from the case file · ' + date,
      body: statement
    },
    {
      id: 'letter',
      title: secondTitle,
      meta: 'Drafted from the case file · ' + date,
      body: letter
    }
  ];
};
