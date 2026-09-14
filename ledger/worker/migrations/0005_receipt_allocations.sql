CREATE TABLE receipt_allocations (
 document_hash TEXT NOT NULL, payment_key TEXT NOT NULL, transaction_id INTEGER NOT NULL,
 PRIMARY KEY(document_hash,payment_key)
);
