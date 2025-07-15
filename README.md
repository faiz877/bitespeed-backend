# Identity Reconciliation Service

This is a backend service designed to handle identity reconciliation for customer contacts (emails and phone numbers). It identifies, links, and merges contact information to ensure each customer has a single, consistent primary contact record.

The service is built with **Node.js** and **TypeScript**, uses **PostgreSQL** as its database, and is deployed as a **serverless API** on **AWS Lambda** via **API Gateway**.

## Features

*   **Contact Identification:** Finds existing contacts based on email and/or phone number.
*   **Contact Linking:** Links new contact information to an existing primary contact if a match is found.
*   **Identity Reconciliation/Merging:** Merges multiple primary contact groups into a single primary contact if their associated identifiers overlap, promoting the oldest contact to primary status.
*   **Atomic Operations:** All reconciliation logic runs within a single database transaction to ensure data consistency.

## Technologies Used

*   **Node.js**
*   **TypeScript**
*   **PostgreSQL** (Database)
*   **AWS Lambda** (Serverless Compute)
*   **AWS API Gateway** (REST API Endpoint)

## Endpoint

The hosted endpoint for the API is:

`https://wtvgl8j1w5.execute-api.eu-north-1.amazonaws.com/default/identity-reconciliation`

## Testing the Deployed API

You can test the deployed API using `curl` or Postman.

#### Example Request (Creating a New Primary Contact)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lambda.test@example.com",
    "phoneNumber": "1000000000"
  }' \
  https://wtvgl8j1w5.execute-api.eu-north-1.amazonaws.com/default/identity-reconciliation
```

#### Example Request (Linking Existing Email with New Phone)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lambda.test@example.com",
    "phoneNumber": "1000000001"
  }' \
  https://wtvgl8j1w5.execute-api.eu-north-1.amazonaws.com/default/identity-reconciliation
```
