// supabase/functions/_shared/ksef-urls.ts

export const KSEF_API_URLS = {
  test: 'https://ksef-test.mf.gov.pl/api',
  demo: 'https://ksef-demo.mf.gov.pl/api', 
  production: 'https://ksef.mf.gov.pl/api'
} as const;

export const getKSeFApiUrl = (environment: 'test' | 'demo' | 'production'): string => {
  return KSEF_API_URLS[environment];
};

export const KSEF_ENDPOINTS = {
  authorizationChallenge: '/online/Session/AuthorizationChallenge',
  initToken: '/online/Session/InitToken',
  invoiceQuery: '/online/Invoice/Query',
  sessionClose: '/online/Session/Close'
} as const;