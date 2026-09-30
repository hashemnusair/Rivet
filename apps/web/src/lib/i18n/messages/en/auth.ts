/**
 * Sign-in and identity pages: /login, the gym, member and platform doors, the
 * invitation page, and the profile steps that follow a first sign-in.
 * Wording follows docs/22_PLAIN_LANGUAGE_GUIDE.md.
 *
 * Text that comes from Clerk (its own error messages) or from the server stays
 * in English; only text RIVET writes lives here.
 */
export const auth = {
  /** The two-column frame around every sign-in page. */
  chrome: {
    homeLabel: "RIVET home",
    footerBrand: "RIVET · Gym revenue & operations",
    footerPlace: "Amman · JOD",
    alreadyHaveAccount: "Already have an account? Sign in",
    createMemberAccount: "Create a member account",
    whatsapp: "WhatsApp {phone}",
    privacy: "Privacy policy",
    terms: "Terms of service",
    secureSignIn: "Secure sign-in",
    staffOnly: "For RIVET staff only",
    checkingSignIn: "Checking sign-in",
    backToSignIn: "Back to sign in",
  },

  /** Copy on the dark brand panel, one set per door. */
  brand: {
    chooser: {
      context: "Gym revenue & operations",
      headline: "Never lose a renewal, a lead, or a dinar again.",
      body: "Members, sales, reception, payments and cash in one place. Every member has one full history. You always know who did what.",
    },
    account: {
      context: "One sign-in for everyone",
      headline: "Sign in once. We open the right page for you.",
      body: "Members see their memberships. Gym staff see their gym. RIVET staff see the platform console.",
    },
    staff: {
      context: "RIVET for gyms",
      headline: "Never lose a renewal, a lead, or a dinar again.",
      body: "Members, sales, reception, payments and cash in one place. Every member has one full history. You always know who did what.",
    },
    member: {
      context: "RIVET for members",
      headline: "Every gym you train at, in one account.",
      body: "See your membership, when it ends, your visits, what you owe and your receipts. Show your entry code to get in.",
    },
    admin: {
      context: "RIVET platform",
      headline: "Every gym on RIVET, on one screen.",
      body: "Gym health, plans, invoices and support in one place.",
    },
  },

  /** Door titles and one-line descriptions (the portal table keeps the English for routing and tests). */
  portal: {
    account: { title: "Sign in to RIVET", blurb: "Choose gym team or gym member." },
    staff: { title: "Gym team", blurb: "For gym owners and staff." },
    member: {
      title: "Gym member",
      blurb: "See your memberships, visits, receipts and entry code.",
      signUpTitle: "Create a member account",
    },
    admin: { title: "Platform administration", blurb: "Gyms, plans, billing and support. For RIVET staff." },
    createAccount: "Create a {portal} account",
  },

  /** Page titles shown in the browser tab. */
  pageTitle: {
    signIn: "Sign in",
    admin: "Platform administration",
    gym: "Gym team sign-in",
    member: "Member sign-in",
    memberCreate: "Create a member account",
    invitation: "Accept gym invitation",
  },

  password: {
    show: "Show password",
    hide: "Hide password",
  },

  /** The email and password form and the second step after it. */
  signIn: {
    emailLabel: "Email address",
    emailPlaceholder: "Enter email",
    passwordPlaceholder: "Enter password",
    newMember: "New member?",
    createFreeAccount: "Create a free account",
    errors: {
      couldNotSignIn: "We could not sign you in. Try again.",
      incorrect: "The email or password is incorrect.",
      unsupportedStep: "This account needs a sign-in step we cannot show here. Contact RIVET support.",
      nextStepFailed: "We could not start the next sign-in step. Try again.",
      anotherStep: "Sign-in needs another step. Try again or contact RIVET support.",
      codeIncorrect: "That code is not correct. Try again.",
      notFinished: "Sign-in is not finished yet. Try again.",
      resendFailed: "We could not send a new code. Try again.",
      startOverFailed: "We could not start over. Try again.",
    },
    verify: {
      emailTitle: "Check your email",
      phoneTitle: "Check your phone",
      moreTitle: "One more step",
      emailSent: "We sent a 6-digit code to your email. Enter it to finish signing in.",
      phoneSent: "We sent a 6-digit code to your phone. Enter it to finish signing in.",
      totp: "Enter the 6-digit code from your authenticator app.",
      backup: "Enter one of your saved backup codes.",
      backupLabel: "Backup code",
      codeLegend: "Sign-in code",
      digit: "Digit {number}",
      submit: "Verify and continue",
      useAnother: "Use another account",
      resend: "Didn’t get it? Send a new code",
    },
  },

  /** Seeded preview accounts, shown only in the demo build. */
  preview: {
    heading: "Preview an account",
    member: "Member preview",
    gym: "Gym team preview",
    admin: "Platform admin preview",
    signInAs: "Sign in as",
    staffRoleGroup: "Staff role",
    signInAsName: "Sign in as {name}",
    staffScope: {
      owner: "Income, branches, staff, history",
      manager: "Approvals, cash counts, daily lists",
      salesperson: "Leads, follow-ups, new members",
      receptionist: "Find members, check-in, payments, renewals",
    },
    continueAs: "Continue as",
    memberGroup: "Member account",
    continueAsName: "Continue as {name}",
    memberFallback: "member",
    newToRivet: "New to RIVET?",
    adminNote: "Manage gyms, plans, billing and support for every gym on RIVET. This demo does not give your account real admin access.",
    openConsole: "Open platform console",
    noRoleSource: "This test version cannot find your account. These are demo accounts, not yours.",
    couldNotSignIn: "Could not sign in. Try again.",
  },

  signedInIdentity: {
    fallbackLabel: "your account",
    signedInAs: "Signed in as",
  },

  doors: {
    staffPrefix: "RIVET staff:",
  },

  /** What happens after sign-in: opening the right page, or explaining why not. */
  identity: {
    signedIn: "You’re signed in",
    gettingReady: "Getting your account ready",
    openingAccount: "Opening your account",
    confirmingInvitation: "Confirming your gym invitation",
    checkingInvitation: "Checking your gym invitation",
    openingGym: "Opening your gym",
    openingMemberships: "Opening your memberships",
    openingConsole: "Opening the platform console",

    deactivatedTitle: "This account was deactivated",
    deactivatedBody: "This RIVET account was deactivated by your gym. Ask the gym owner or manager to restore your access, or sign out and use another account.",
    loadFailedTitle: "We could not load your account",
    loadFailedBody: "You are signed in, but we could not load your account. Sign out and sign in again.",

    invitationFailedTitle: "We could not confirm your gym invitation",
    invitationFailedBody: "Ask your gym owner to send the invitation again. Then sign in again.",

    noTeamTitle: "This account is not on a gym team",
    noTeamBody: "This sign-in is for gym staff. Ask your gym owner or manager to invite you. If you train at a gym, use member sign-in.",
    noTeamAddBody: "Ask your gym owner or manager to add your email to the team. Then sign in here again.",

    wrongMemberTitle: "This sign-in is for gym members",
    wrongMemberBody: "Gym staff accounts cannot sign in here. Use gym team sign-in.",
    wrongAdminTitle: "This is for RIVET staff only",
    wrongAdminBody: "Only RIVET staff can sign in here.",

    chooseGymTitle: "Choose a gym",
    chooseGymBody: "You work at more than one gym. Choose the one to open.",
    gymOpenFailed: "That gym could not be opened. Try again.",

    unavailableTitle: "Your gym is not active on RIVET",
    unavailableBody: "Your gym's RIVET plan is not active right now. Contact RIVET to turn it back on, or sign out and use another account.",

    noBranchTitle: "You are not added to a branch",
    noBranchBody: "Ask your gym manager to add you to a branch.",
    chooseBranchTitle: "Choose a branch",
    chooseBranchBody: "You work at more than one branch. Choose the one to open.",
    branchOpenFailed: "That branch could not be opened. Try again.",
    branchOpenToast: "Could not open that branch. Try again.",

    gymToast: "Could not open your gym. Try again.",
    gymFailedTitle: "Your gym could not be opened",
    gymFailedBody: "We found your gym but could not open it here. Sign out and sign in again.",

    memberFailedTitle: "Your member account could not be opened",
    memberFailedBody: "You are signed in, but we could not open your account here. Sign out and sign in again.",

    notStaffTitle: "This account is not RIVET staff",
    notStaffBody: "Only RIVET staff can open the platform console.",

    signOutFailed: "Could not sign out. Please try again.",
    signingOut: "Signing out",
    signOutUseAnother: "Sign out and use another account",
  },

  /** The name step for a new Clerk account. */
  profile: {
    title: "Finish setting up your profile",
    introWithEmail: "You are signed in as {email}. Add your name to continue. You only do this once.",
    intro: "You are signed in. Add your name to continue. You only do this once.",
    firstName: "First name",
    lastName: "Last name",
    submit: "Save and continue",
    ready: "Your profile is ready.",
    saveFailed: "We could not save your name. Please try again.",
  },

  /** The details step for a member whose profile is missing. */
  memberSetup: {
    title: "Finish your member profile",
    intro: "You are signed in as {email}. Add these details to see your memberships.",
    fullName: "Full name",
    mobile: "Mobile number",
    gender: "Gender",
    genderChoose: "Choose female or male",
    female: "Female",
    male: "Male",
    submit: "Finish member setup",
    saveFailed: "We could not save your details. You are still signed in. Try again.",
  },

  /** Messages shown under a field. */
  validation: {
    firstName: "Enter your first name",
    lastName: "Enter your last name",
    max80: "Use 80 characters or fewer",
    passwordMin: "Use at least 8 characters",
    passwordMax: "Use 128 characters or fewer",
    passwordMismatch: "Passwords do not match",
    fullName: "Enter your full name",
    emailInvalid: "Your account needs a valid email address",
    mobileRequired: "Enter your mobile number",
    mobileInvalid: "Enter a valid mobile number",
    genderRequired: "Choose female or male",
  },

  /** The link a gym owner or manager sends to a new team member. */
  invitation: {
    linkBrokenTitle: "This invitation link does not work",
    linkBrokenBody: "Open the link from your invitation email. If it still does not work, ask the person who invited you to send it again.",
    expiredTitle: "Invitation expired",
    cancelledTitle: "Invitation cancelled",
    alreadyAcceptedTitle: "This invitation was already accepted",
    alreadyAcceptedBody: "Your account is ready. Sign in with the email address the invitation was sent to. The link works only once.",
    signIn: "Sign in",
    notHereTitle: "Invitations cannot be accepted here",
    notHereBody: "This is a test version of RIVET. Open the link in your invitation email instead.",
    couldNotAcceptTitle: "Invitation could not be accepted",
    couldNotAcceptBody: "Ask the person who invited you to send it again.",

    error: {
      expired: "This invitation has expired. Ask the person who invited you to send a new one.",
      revoked: "This invitation was cancelled. Ask the person who invited you to send a new one.",
      alreadyUsed: "This invitation was already used. Sign in with the email address it was sent to.",
      emailMismatch: "This invitation is for a different email address. Open it from the email it was sent to.",
      notConfirmed: "We could not confirm this invitation. Open the link in the email again, or ask the person who invited you to send it again.",
      generic: "We could not accept this invitation. Ask the person who invited you to send a new one.",
      needsSignInStep: "This invitation needs one more sign-in step before you can accept it.",
      needsDetails: "Your account needs more details before you can accept this invitation.",
    },

    form: {
      title: "Create your RIVET account",
      intro: "Your invitation is confirmed. Add your name and a password to open your gym. The person who invited you already chose your role.",
      firstName: "First name",
      lastName: "Last name",
      password: "Password",
      passwordHint: "At least 8 characters",
      confirmPassword: "Confirm password",
      submit: "Create account",
      onceOnly: "This link works only once, for the email address it was sent to.",
      accountReady: "Your gym account is ready.",
    },

    progress: {
      accepted: "Invitation accepted",
      checking: "Checking your invitation",
      opening: "Opening your gym…",
      moment: "This only takes a moment…",
    },

    conflict: {
      title: "You are already signed in",
      body: "Sign out first. The invitation must be accepted by the email address it was sent to.",
      submit: "Sign out and continue",
    },
  },
};
