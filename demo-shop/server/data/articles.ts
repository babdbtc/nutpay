export interface Article {
  id: number;
  title: string;
  author: string;
  teaser: string;
  content: string;
  price: number;
  unit: string;
  publishedAt: string;
}

export const articles: Article[] = [
  {
    id: 1,
    title: 'Why Ecash Matters for Internet Privacy',
    author: 'Satoshi Nakamoto Jr.',
    teaser: 'In a world of increasing digital surveillance, ecash protocols offer a path back to transactional privacy. Here is why bearer tokens are the future of online payments.',
    content: `In a world of increasing digital surveillance, ecash protocols offer a path back to transactional privacy. Here is why bearer tokens are the future of online payments.

The internet was built on the promise of freedom and anonymity. Yet today, every purchase you make online creates a permanent record — your name, address, card number, and buying habits stored across dozens of databases. Credit card companies track your spending patterns. Payment processors build profiles. Data brokers sell your transaction history.

Ecash changes this equation fundamentally. Based on David Chaum's blind signature scheme from 1982, modern ecash protocols create digital bearer instruments — tokens that carry value without carrying identity. When you pay with ecash, the merchant receives valid proof of payment without learning who you are.

The key innovation is the mint: a trusted issuer that signs tokens without seeing what it signs. Through a cryptographic technique called blind signatures, the mint can verify a token is legitimate without knowing which user it belongs to. This creates perfect unlinkability — the mint cannot connect deposits to withdrawals.

For web payments, this unlinkability is revolutionary. Instead of sharing your credit card with every website, you present a bearer token. The website verifies it with the mint and delivers your content. No accounts. No passwords. No tracking. Just value exchanged for goods.

The implications extend beyond privacy. Micropayments become viable when transaction costs approach zero. Pay one satoshi to read an article. Pay two to download an icon set. The overhead of account creation and credit card processing disappears entirely.

This is not a theoretical future. The technology exists today, implemented in open protocols that any developer can integrate into their applications.`,
    price: 2,
    unit: 'sat',
    publishedAt: '2024-11-15',
  },
  {
    id: 2,
    title: 'Building a 402-Enabled Web',
    author: 'Ada Lovelace III',
    teaser: 'HTTP status code 402 was reserved for "Payment Required" since 1999. Twenty-five years later, we finally have the technology to use it. Here is how the web is being rebuilt around native payments.',
    content: `HTTP status code 402 was reserved for "Payment Required" since 1999. Twenty-five years later, we finally have the technology to use it. Here is how the web is being rebuilt around native payments.

When the HTTP specification defined status code 402, the authors knew the web would eventually need native payment capabilities. But the technology was not ready. Digital cash was theoretical. Micropayments were economically impossible. The code sat unused for a quarter century.

Today, the pieces have fallen into place. Lightning Network enables instant, near-zero-fee bitcoin transfers. Ecash protocols add privacy and offline capability. Browser extensions can intercept HTTP responses and handle payment flows transparently. The 402 status code is finally fulfilling its purpose.

The flow is elegant in its simplicity. A client requests a resource. The server responds with 402 and includes payment details in a header. The browser extension detects this, prompts the user, creates a payment token, and retries the request with payment attached. The server validates the token and delivers the content. From the user's perspective, they click a button and content appears.

This model eliminates the entire subscription economy infrastructure. No monthly plans. No account creation. No forgotten passwords. No recurring charges for services you barely use. Instead, you pay for exactly what you consume, at the moment you consume it.

For developers, implementation is straightforward. Return a 402 response with payment details. Validate incoming tokens. Serve content. The complexity lives in the wallet — and that is someone else's problem.

The advertising-supported web was a compromise born from the impossibility of micropayments. With 402 payments, that compromise is no longer necessary. Content creators can be paid directly, privately, and instantly.`,
    price: 4,
    unit: 'sat',
    publishedAt: '2024-12-01',
  },
  {
    id: 3,
    title: 'The Case for Digital Bearer Instruments',
    author: 'Hal Finney II',
    teaser: 'Cash has properties that digital payments have long lacked: privacy, finality, and peer-to-peer transfer. Digital bearer instruments bring these properties to the internet age.',
    content: `Cash has properties that digital payments have long lacked: privacy, finality, and peer-to-peer transfer. Digital bearer instruments bring these properties to the internet age.

Physical cash is remarkable technology. A ten dollar bill works without an internet connection. It does not require a bank account. The merchant does not learn your name. The transaction is final — no chargebacks, no reversals. And it can be handed from person to person indefinitely without any central authority's involvement.

Digital payment systems abandoned all of these properties. Credit cards require identity verification. Bank transfers need accounts. Every transaction routes through intermediaries who record, analyze, and sometimes block your payments. Settlement takes days. Chargebacks create uncertainty.

Digital bearer instruments restore what was lost. Like physical cash, they carry value intrinsically. Possession equals ownership. Transfer requires no permission. And modern cryptography adds properties that physical cash never had: perfect divisibility, instant verification, and the ability to transmit value at the speed of light.

The technical foundation is elegant. A mint issues signed tokens in fixed denominations. Users receive these tokens in exchange for depositing funds. The tokens can be transferred, split, and merged — all without the mint's involvement or knowledge. When a token is finally redeemed, the mint verifies the signature and honors the value.

What makes this approach superior to existing digital payments is not any single property but the combination. Privacy preserving yet cryptographically verifiable. Offline capable yet double-spend resistant. Decentralized in transfer yet backed by identifiable issuers.

For the first time, we can have digital money that works like physical money — but better.`,
    price: 1,
    unit: 'sat',
    publishedAt: '2025-01-10',
  },
];
