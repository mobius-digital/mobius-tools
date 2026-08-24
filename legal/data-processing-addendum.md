# Data Processing Addendum

**Between:** Mobius Digital LLC ("Mobius", the Processor)
**And:** the client named in the agreement this addendum is attached to ("the Client", the Controller)

This addendum forms part of the services agreement between Mobius and the Client. It
records how Mobius handles personal data belonging to the Client's customers. Where it
conflicts with the main agreement on the handling of personal data, this addendum governs.

---

## 1. Roles

The Client is the data controller for its customers' personal data. Mobius is a data
processor acting only on the Client's documented instructions. This agreement, and the
Client's act of connecting a data source to Mobius, are those instructions.

## 2. What Mobius processes, and why

Mobius provides marketing services and reporting. To do that it reads, from systems the
Client connects:

| Source | What is read | Purpose |
|---|---|---|
| Shopify | Order totals, dates, discounts, returns, shipping and tax | Revenue and contribution margin reporting |
| Shopify | Order counts and first-order dates | Reporting new versus returning customers and how customer value develops |
| Shopify | Product and variant costs | Gross margin reporting |
| Advertising platforms | Campaign spend and performance | Managing and reporting on advertising |

Mobius processes this data **only** to provide the agreed services to that Client. It is
never pooled with another client's data, never sold, never rented, never used for
Mobius's own marketing, and never used to train machine-learning models.

## 3. What Mobius stores

**Mobius does not store customer-level personal data.** Customer and order data is read,
aggregated in memory, and only aggregate figures are written to Mobius systems — monthly
and daily totals such as revenue, order counts, ad spend, and the number of customers who
first purchased in a given month together with their combined spend.

Mobius does **not** store customer names, email addresses, postal addresses, telephone
numbers, payment details, or individual order or customer records.

## 4. Sub-processors

Mobius uses the following sub-processors. The Client consents to their use, and Mobius
remains responsible for their performance.

| Sub-processor | Purpose |
|---|---|
| Cloudflare, Inc. | Hosting, compute and database storage |
| Slack Technologies | Delivering reports to a channel the Client nominates |
| Anthropic PBC | Generating the written commentary in reports |
| Triple Whale, Inc. | Ecommerce analytics, where the Client has connected it |

Mobius will give the Client reasonable notice before adding or replacing a sub-processor,
and the Client may object on reasonable data-protection grounds.

## 5. Security

- All data is encrypted in transit using HTTPS/TLS.
- Data at rest is encrypted by the hosting provider.
- Access is limited to Mobius personnel who need it to deliver the services.
- Access credentials and API tokens are held as server-side secrets and are never exposed
  to a browser or to any third party.
- Inbound webhooks are verified by signature and rejected if the signature does not match.

## 6. Confidentiality

Mobius personnel with access to the Client's data are bound by confidentiality obligations
that survive the end of their engagement.

## 7. Retention and deletion

Aggregated reporting data is retained while the services are active and for up to 30 days
after they end or after the Client disconnects the data source, after which it is deleted.
Mobius will delete the data sooner on the Client's written request.

## 8. Assisting the Client

Because Mobius holds no customer-level personal data, there is normally nothing to
retrieve, correct or erase in response to an individual's request. Where assistance is
nonetheless needed, Mobius will provide it, at no charge, within a reasonable period.

Mobius receives and acts on Shopify's mandatory `customers/data_request`,
`customers/redact` and `shop/redact` notifications.

## 9. Personal data breach

Mobius will notify the Client without undue delay, and in any event within 72 hours, of
becoming aware of any breach affecting the Client's data, with the facts known at that
time and the steps being taken.

## 10. International transfers

Data is processed on infrastructure operated by the sub-processors above, which may
process data outside the Client's country. Mobius relies on those providers' standard
contractual clauses or equivalent safeguards.

## 11. Audit

On reasonable written notice and no more than once a year, Mobius will provide the Client
with the information reasonably necessary to demonstrate compliance with this addendum.

## 12. Return and deletion at termination

On termination, Mobius will delete the Client's data in accordance with clause 7. Access
tokens are revoked immediately on disconnection or uninstallation.

---

**Signed for Mobius Digital LLC**

Name: ............................................  Date: ....................

Signature: ......................................

**Signed for the Client**

Name: ............................................  Date: ....................

Signature: ......................................

---

*This addendum reflects how the services actually operate. It is not legal advice; each
party should satisfy itself that the terms meet its own obligations. If your clients
include EU or UK data subjects, have a solicitor confirm the international-transfer and
audit clauses before relying on them.*
