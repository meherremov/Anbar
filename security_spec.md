# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Single Store Owner Exclusivity**: Only the verified store owner (`request.auth.token.email == 'sabirismayil01@gmail.com'` and `request.auth.token.email_verified == true`) may read, list, create, update, or delete documents in `/products/{productId}` and `/categories/{categoryId}`.
2. **Ownership Integrity**: Every document must carry `ownerId == request.auth.uid` on creation, and `ownerId` and `createdAt` are immutable on update.
3. **Strict Schema Enforcement**: No shadow fields (`hasOnly` enforced on create and `affectedKeys().hasOnly(...)` enforced on update), explicit types, bounded string lengths, and non-negative numeric bounds (`quantity >= 0`, `salePrice >= 0`, `purchasePrice >= 0`, `minStock >= 0`).
4. **Temporal Integrity**: `createdAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on both creation and update.
5. **Path Hardening**: All single-document operations validate `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, length `<= 128`).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read/List**: `auth == null` querying `/products`.
2. **Unauthorized User Read**: Verified user `other@gmail.com` attempting `get` or `list` on `/products`.
3. **Unverified Email Spoof**: User with `email == 'sabirismayil01@gmail.com'` and `email_verified == false` attempting read/write.
4. **Identity Spoofing on Create**: Owner creating a product with `ownerId: 'someone-else-uid'`.
5. **Shadow Field Injection on Create**: Owner creating a product with an extra unknown field `isAdmin: true`.
6. **Shadow Field Injection on Update**: Owner updating `salePrice` alongside an extra field `discountOverride: 99`.
7. **Immutable Field Tampering**: Owner attempting to mutate `createdAt` or `ownerId` during an update.
8. **Client-Forged Timestamp**: Owner creating or updating a product with a past client timestamp instead of `request.time`.
9. **Negative Stock / Price Poisoning**: Owner setting `quantity: -5` or `salePrice: -10`.
10. **Oversized String Resource Poisoning**: Owner passing a 5,000-character `name` or 500-character `barcode`.
11. **Invalid Document ID Poisoning**: Creating a document at `/products/invalid id with spaces$$`.
12. **Type Confusion Attack**: Updating `quantity` with a string `"10"` instead of a number, or `barcode` with an integer.
