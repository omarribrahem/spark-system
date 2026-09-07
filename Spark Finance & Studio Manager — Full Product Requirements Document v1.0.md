# Spark Finance & Studio Manager
## Product Requirements Document — Source of Truth

**Version:** 1.0  
**Product Type:** Local Desktop Business Management Application  
**Primary User:** Safaa — Administration / Finance / Studio Booking  
**Business:** Spark  
**Primary Technology:** React + TypeScript  
**Recommended Desktop Runtime:** Tauri  
**Recommended Local Database:** SQLite  
**Network Requirement:** None for core functionality  
**Primary Currency:** EGP  
**Language:** Arabic-first UI with support for English labels where useful  
**Last Updated:** September 2026

---

# 1. Product Vision

Spark Finance & Studio Manager is a lightweight internal desktop application used by Spark to manage:

- Clients
- Services
- Monthly marketing contracts
- Monthly subscription services
- Website projects
- Spark Studio bookings
- Recurring studio reservations
- Studio hour packages
- Reel packages
- Mixed packages containing hours + reels
- Payments
- Partial payments
- One payment distributed across multiple services
- Client outstanding balances
- Remaining service balances
- Basic company expenses
- Daily operational dashboard
- Basic financial reports

The product is **not intended to become a full accounting ERP**.

The primary purpose is operational clarity:

> مين دفع؟  
> دفع كام؟  
> مقابل إيه؟  
> فاضله كام فلوس؟  
> فاضله كام ساعة أو Reel؟  
> عنده حجز إمتى؟  
> وإيه اللي محتاج صفاء تتابعه النهاردة؟

---

# 2. Product Problem

Spark currently operates multiple service types with different financial and operational behavior.

Examples:

- Marketing is normally paid monthly.
- Studio is calculated primarily by hours.
- Studio clients may book a single session or recurring sessions.
- A client can buy a fixed number of studio hours.
- A client can buy a number of reels.
- A package can contain both hours and reels.
- Reels can be filmed together or across several different studio bookings.
- Website projects can be partially paid.
- One payment can cover several different services.
- Clients may remain active while still owing money.

A normal spreadsheet becomes difficult because financial balance and service balance are not always the same thing.

Example:

Package:

- Price: 1,500 EGP
- Includes: 3 reels

Client pays:

- 1,500 / 1,500

Financial balance:

- 0 EGP remaining

But service balance:

- 1 reel used
- 2 reels remaining

Therefore the application must explicitly separate:

## Financial Balance

What money has been paid or remains due.

from:

## Service Balance

What units of service the client has purchased and still owns.

This distinction is a fundamental product rule.

---

# 3. Core Product Principles

## 3.1 Simple Before Accounting Complexity

The system should answer operational business questions without introducing unnecessary accounting concepts.

Do not implement:

- Double-entry accounting
- General ledger
- Chart of accounts
- Tax accounting
- Vendor accounting
- Complex payroll
- Accrual accounting
- Accounts payable workflows
- Bank reconciliation

unless explicitly added in a future version.

---

## 3.2 No Hard-Coded Prices

Prices must never be permanently encoded into the application.

Examples:

- Studio hourly rate
- Reel package price
- Marketing monthly amount
- Website price
- Subscription monthly rate

must be entered when creating:

- Contract
- Package
- Project
- Booking
- Client subscription

Historical records preserve their original price even if current prices change.

---

## 3.3 Client-Centered Model

The client is the center of the system.

A single client may simultaneously have:

- Marketing contract
- Website project
- Studio package
- Reel package
- Mixed studio + reels package
- Monthly subscription
- Additional custom services

All should appear inside one client profile.

---

## 3.4 Money and Service Usage Are Independent

A payment does not automatically mean that a service was consumed.

A service being consumed does not necessarily mean that a payment was made at that moment.

Example:

Client buys:

- 10 Studio Hours
- 3 Reels

and pays fully.

After filming:

- 4.5 hours used
- 1 reel used

Financial state:

- Fully Paid

Service state:

- 5.5 Studio Hours Remaining
- 2 Reels Remaining

---

## 3.5 Offline First

The application should operate completely locally on Spark's laptop.

Core operations must work without internet:

- Opening client profiles
- Adding payments
- Creating bookings
- Recording expenses
- Viewing dashboard
- Managing packages
- Viewing reports

---

# 4. Users

## 4.1 Primary User — Safaa

Safaa handles:

- Financial records
- Money in
- Money out
- Client balances
- Studio bookings
- Studio schedule
- Package balances
- Monthly collections

The UI must therefore prioritize:

- Speed
- Clarity
- Low number of clicks
- Clear Arabic labels
- Immediate alerts
- Easy correction of mistakes

---

## 4.2 Owner / Management

Management needs:

- Monthly income
- Monthly expenses
- Outstanding client money
- Revenue by service
- Studio bookings
- Remaining packages
- Client financial history

The first version does not require separate authentication or permissions because the application runs locally on one controlled laptop.

Multi-user permissions are outside MVP.

---

# 5. Core Service Architecture

The initial system contains four primary business service families.

## 5.1 Marketing

Monthly client work.

Billing model:

`MONTHLY`

---

## 5.2 Spark Studio

Studio usage primarily measured using hours.

Supports:

- Single booking
- Recurring booking
- Hour packages
- Reels
- Combined hour + reel packages

Billing model may be:

`HOURLY`

or

`PACKAGE`

---

## 5.3 Websites

Project-based service.

Billing model:

`PROJECT`

---

## 5.4 Monthly Subscription Service

Used for the fourth recurring service such as the current 3arrab subscription operation.

Billing model:

`MONTHLY`

Exact service name and monthly amount must remain configurable.

---

# 6. Dynamic Services

The application must not depend permanently on only four services.

A Settings screen must contain:

## Services

Existing examples:

- Marketing
- Spark Studio
- Website
- Monthly Subscription

Button:

`+ Add Service`

When adding a service:

- Service name
- Internal description — optional
- Billing model
- Active / inactive

Supported billing models:

- Monthly
- Project
- One-off
- Package
- Custom

Custom services do not automatically receive Studio-specific behavior.

---

# 7. Navigation Architecture

Recommended sidebar:

```text
Dashboard

Clients

Studio
  Calendar
  Bookings
  Packages

Marketing

Websites

Subscriptions

Payments

Expenses

Reports

Settings
```

Global top bar:

- Search
- Today's date
- Quick Add button

Quick Add menu:

- New Client
- New Payment
- New Booking
- New Expense
- New Package
- New Website Project

---

# 8. Dashboard

The Dashboard is an **operational dashboard first** and financial dashboard second.

The user should understand the current day within a few seconds.

---

# 8.1 Dashboard — Today Section

Display:

### Today's Studio Bookings

Example:

`5 Bookings`

Show nearest upcoming booking.

Example:

> Ahmed Hassan  
> 2:00 PM → 4:00 PM  
> 2 Hours

---

### Money Due Today

Total expected client payments due today.

Example:

`8,500 EGP`

---

### Overdue Amount

Total outstanding money whose due date has passed.

Example:

`12,000 EGP`

---

### Upcoming Collections

Amounts expected within the next 7 days.

---

# 8.2 Studio Today Timeline

Display chronological studio schedule.

Example:

```text
12:00    Free

01:00    Ahmed Hassan
         01:00 → 03:00

03:00    Free

04:00    Mohamed Ali
         04:00 → 06:30

07:00    Reem
         07:00 → 08:00
```

Each booking card displays:

- Client
- Start time
- End time
- Planned duration
- Booking status
- Package indicator if applicable

---

# 8.3 Needs Attention

A central operational alert area.

Examples:

- Marketing payment overdue
- Website payment overdue
- Package has less than 2 hours
- Client has only 1 reel remaining
- Client has payment due tomorrow
- Studio booking begins soon
- Partial payment still has remaining balance
- Recurring booking is ending soon

Alerts are informational only.

They do not automatically send WhatsApp messages in MVP.

---

# 8.4 Month Snapshot

Display only key numbers.

### Money In

Total actual payments received during current month.

### Expenses

Total expenses recorded during current month.

### Outstanding

Total currently unpaid client obligations.

### Net Cash Difference

Formula:

```text
Money In - Expenses
```

This is an operational cash result, not formal accounting net profit.

---

# 8.5 Package Balances

Show clients with active packages.

Columns:

- Client
- Package
- Hours Remaining
- Reels Remaining
- Status

Highlight low balances.

Default warning:

### Studio Hours

Low if:

`Remaining <= 2 hours`

### Reels

Low if:

`Remaining <= 1 reel`

Thresholds should later become configurable.

---

# 8.6 Upcoming

### Tomorrow

- Studio bookings count
- Payments due

### This Week

- Studio bookings
- Marketing payments
- Website payments
- Subscription renewals

---

# 9. Client Management

---

# 9.1 Client List

Columns:

- Client name
- Brand/company
- Phone
- Active services
- Total outstanding
- Next booking
- Status

Search by:

- Client name
- Phone
- Company

Filters:

- Active
- Inactive
- Has Outstanding
- Has Studio Package
- Marketing
- Website
- Subscription

---

# 9.2 Create Client

Required:

- Client name

Optional:

- Company / brand
- Phone number
- Secondary phone
- Notes

System-generated:

- Client ID
- Created date
- Updated date

---

# 9.3 Client Profile

Header:

- Client name
- Brand/company
- Phone
- Client status
- Quick actions

Quick actions:

- Add Payment
- Add Booking
- Add Package
- Add Service
- Add Note

---

# 9.4 Client Overview

The profile should show:

## Financial

- Total contracted / purchased value
- Total paid
- Total remaining

## Services

Cards for:

- Marketing
- Studio
- Websites
- Subscription
- Custom services

## Package Balances

Example:

```text
Studio Package
10 Hours Purchased
6.5 Used
3.5 Remaining

Reel Package
3 Reels Purchased
1 Used
2 Remaining
```

## Upcoming

- Next booking
- Next payment
- Contract ending date

## History

Unified chronological history:

- Payment received
- Booking created
- Booking completed
- Package purchased
- Reel used
- Contract created
- Expense is not shown here unless directly relevant

---

# 10. Marketing Module

Marketing is normally a monthly service.

---

# 10.1 Marketing Contract

Fields:

- Client
- Contract name
- Monthly amount
- Start date
- End date
- Payment timing
- Status
- Notes

Payment timing default:

`End of Month`

but may be changed if necessary.

---

# 10.2 Contract Status

Supported states:

- Draft
- Active
- Paused
- Ended
- Cancelled

---

# 10.3 Monthly Billing

For every active month, the system creates a monthly due record.

Example:

```text
Client: Noor
Month: September 2026
Base Amount: 6,000
Extras: 1,000
Total Due: 7,000
Paid: 4,000
Remaining: 3,000
Status: Partial
```

---

# 10.4 Marketing Monthly Due Status

Possible states:

- Upcoming
- Due
- Partial
- Paid
- Overdue

---

# 10.5 Overdue Does Not Stop Service

Important business rule:

If marketing payment becomes overdue:

- Contract stays active.
- Service is not automatically paused.
- System displays outstanding balance.
- Safaa may manually pause contract if management decides.

---

# 10.6 Marketing Extras

The monthly record may contain extra charges.

Examples:

- Additional reel
- Extra shooting
- Additional design
- Additional requested work
- Other

Extra fields:

- Description
- Amount

Formula:

```text
Monthly Total =
Base Monthly Amount
+ Extras
```

---

# 10.7 Contract End

If contract has an end date:

No new monthly due should be generated after the final contract month.

Contract may later be:

- Extended
- Renewed
- Ended

Renewal may create a new contract or extend current end date.

---

# 11. Monthly Subscription Module

This module manages monthly recurring services that are not Marketing.

Example:

- 3arrab subscription / current fourth monthly service

Fields:

- Client
- Subscription service
- Monthly amount
- Start date
- End date — optional
- Billing day / timing
- Status
- Notes

Status behavior follows Marketing monthly payment logic.

Possible monthly payment states:

- Upcoming
- Due
- Partial
- Paid
- Overdue

No historical price should change if current price is later updated.

---

# 12. Website Module

Website projects use a simple project financial model.

---

# 12.1 Website Project Fields

Required:

- Client
- Project name
- Total project price
- Start date

Optional:

- Expected delivery date
- Next payment amount
- Next payment date
- Notes

---

# 12.2 Website Project Status

- New
- In Progress
- Waiting
- Completed
- Cancelled

---

# 12.3 Website Financial Summary

Formula:

```text
Paid =
Sum of allocated payments

Remaining =
Total Project Price - Paid
```

Example:

```text
Project Total: 25,000

Payment 1: 10,000
Payment 2: 5,000

Paid: 15,000
Remaining: 10,000
```

---

# 12.4 Installments

Do not implement a complex installment engine.

Safaa may optionally set:

- Next payment amount
- Next payment date

After payment:

She may set the following payment manually.

---

# 13. Package Engine

The Package Engine is a core system component.

A package may contain one or multiple types of service balance.

---

# 13.1 Package Examples

### Package A

```text
10 Studio Hours
```

### Package B

```text
3 Reels
```

### Package C

```text
10 Studio Hours
+
3 Reels
```

Package C is a normal supported package, not an edge case.

---

# 13.2 Future Package Examples

The architecture should allow:

```text
8 Studio Hours
4 Reels
```

or future units without redesigning the database.

---

# 13.3 Package Template

A reusable package template contains:

- Name
- Default price
- Included items
- Active status

Example:

```text
Creator Package

Default Price: 4,000

Includes:
10 Studio Hours
3 Reels
```

---

# 13.4 Client Package Purchase

When assigned to a client, the package stores a **snapshot**.

Snapshot includes:

- Package name
- Sold price
- Included quantities

Future changes to the package template must not affect old client purchases.

---

# 13.5 Package Entitlement

Each package item contains:

- Unit type
- Purchased quantity
- Used quantity
- Reserved quantity when applicable

Supported core unit types:

- HOURS
- REELS

Architecture should allow more unit types later.

---

# 13.6 Package Financial State

Package financial state is independent from usage state.

Example:

```text
Package Price: 4,000
Paid: 4,000
Money Remaining: 0

Hours:
Purchased 10
Used 4.5
Remaining 5.5

Reels:
Purchased 3
Used 1
Remaining 2
```

---

# 13.7 Package Payment State

- Unpaid
- Partial
- Paid

---

# 13.8 Package Usage State

- Not Started
- Active
- Fully Used
- Cancelled

Package can be:

`Paid + Active`

which means no money remains but service units remain.

---

# 13.9 Fractional Hours

Hours must use decimal values.

Valid examples:

- 0.5
- 1
- 1.5
- 2
- 2.5
- 6.5

Do not use integer-only hour storage.

Recommended DB representation:

minutes as integer.

Example:

```text
1 hour = 60
1.5 hours = 90
6.5 hours = 390
```

This avoids floating-point calculation problems.

UI may display hours.

---

# 14. Studio Module

Spark Studio requires significantly more operational functionality than other services.

---

# 14.1 Studio Main Screens

Studio module contains:

- Calendar
- Booking list
- Create booking
- Recurring bookings
- Packages
- Reels

---

# 14.2 Calendar Views

Support:

- Day
- Week
- Month

Default:

`Week`

---

# 14.3 Booking Types

Supported:

### Single Booking

One booking.

### Recurring Booking

Repeated booking pattern.

### Package Booking

Booking consumes hours from package.

A booking may simultaneously be:

`Recurring + Package`

---

# 14.4 Create Booking Fields

Required:

- Client
- Date
- Start time
- End time

Automatically calculated:

- Planned duration

Optional:

- Package
- Related reels
- Booking price
- Deposit
- Payment
- Notes

---

# 14.5 Booking Duration

Every booking always contains:

`From`

and

`To`

Duration is calculated automatically.

Example:

```text
From: 4:00 PM
To: 6:30 PM

Duration:
2.5 Hours
```

---

# 14.6 Planned vs Actual Duration

A booking contains:

### Planned Duration

Calculated from booked From/To.

### Actual Duration

Entered when session completes.

Example:

```text
Booked:
4:00 → 6:00
2 Hours

Actual:
4:00 → 7:00
3 Hours
```

Package consumption uses:

`Actual Duration`

after completion.

---

# 14.7 Booking Status

States:

- Scheduled
- Confirmed
- In Progress
- Completed
- Cancelled
- No Show

MVP may treat Scheduled and Confirmed similarly operationally, but both are retained for future flexibility.

---

# 14.8 Package Hour Reservation

If a future booking uses a package:

Planned hours become:

`Reserved Hours`

before completion.

Example:

Client package:

```text
Purchased: 10h
Used: 4h
Reserved Future Bookings: 2h
```

Then:

```text
Raw Remaining:
10 - 4 = 6h

Available To Book:
10 - 4 - 2 = 4h
```

This prevents the same package balance being scheduled multiple times.

---

# 14.9 Booking Completion

When a package booking is completed:

1. Release reserved planned duration.
2. Record actual duration.
3. Add actual duration to Used Hours.
4. Recalculate remaining balance.

---

# 14.10 Actual Duration Exceeds Package Balance

Example:

Available package balance:

`1 hour`

Actual session:

`2 hours`

The system must not silently create a negative package.

Display resolution dialog:

> Actual session exceeds package balance by 1 hour.

Options:

### Option A
Create extra billable studio usage for excess hour.

### Option B
Leave excess as outstanding additional studio charge.

Do not automatically delete or ignore excess.

---

# 14.11 Booking Cancellation

If booking is cancelled before completion:

- Reserved hours are released.
- Used hours do not increase.

If booking had accidentally already consumed hours:

Reversing/cancelling must restore those hours.

---

# 14.12 Booking Extension

During or after session:

Safaa can update actual end time.

Example:

```text
Planned:
4:00 → 6:00

Actual:
4:00 → 7:00
```

System recalculates actual duration.

---

# 14.13 Double Booking Prevention

The application should detect overlapping Studio bookings.

Example:

Existing:

```text
4:00 → 6:00
```

New:

```text
5:00 → 7:00
```

Show blocking warning:

> يوجد حجز آخر في نفس الوقت.

Default behavior:

Prevent save.

Optional management override may be added later.

---

# 15. Recurring Studio Bookings

Recurring reservations are required.

Example:

> Every Saturday  
> 4:00 PM → 6:00 PM

---

# 15.1 Recurrence Fields

- Client
- Start date
- End date
- Day(s) of week
- Start time
- End time
- Package — optional
- Notes

---

# 15.2 Generated Bookings

Recurring rule generates individual bookings.

Example:

September Saturdays:

- Sep 5
- Sep 12
- Sep 19
- Sep 26

Each generated booking becomes individually editable.

---

# 15.3 Individual Recurring Exception

Changing one generated booking should ask:

- This booking only
- This and future bookings

MVP requirement:

At minimum support:

`This booking only`

Changing complete recurrence series can be included after MVP if implementation becomes complex.

---

# 15.4 Conflict Detection

Before generating recurring bookings:

System checks every generated time against existing bookings.

Show conflicts before save.

Example:

```text
4 bookings generated
3 available
1 conflict
```

Allow user to:

- Cancel creation
- Skip conflicting date

---

# 16. Reels

Reels are tracked independently from studio hours.

---

# 16.1 Reel Balance

Example:

Package:

`3 Reels`

Fields:

- Purchased
- Used
- Remaining

---

# 16.2 Reel Status

Individual package reel item may be represented as:

- Available
- Planned
- Filmed
- Completed
- Cancelled

For simple balance calculation:

Only `Completed/Consumed` increments Used Reels.

---

# 16.3 Reel and Booking Relationship

A reel may optionally link to one studio booking.

One booking can contain multiple reels.

Example:

```text
Booking:
8 Sep
3 PM → 7 PM

Related:
Reel 1
Reel 2
Reel 3
```

Another scenario:

```text
Reel 1 → Booking A
Reel 2 → Booking B
Reel 3 → Booking C
```

Both are valid.

---

# 16.4 Hours and Reels Do Not Automatically Consume Each Other

Critical rule:

Marking one Reel used does NOT automatically deduct an hour.

Completing one studio hour does NOT automatically deduct one Reel.

They are separate entitlements.

The same booking may affect both only if Safaa explicitly records both.

---

# 17. Deposit Management

Deposit is optional.

Booking contains:

- Deposit required? Yes / No
- Deposit amount

Default:

`No`

If Yes:

- Deposit amount required
- Deposit payment may be linked

Deposit contributes to total paid amount.

---

# 18. Payments Module

Payment methods currently supported:

- Cash
- Vodafone Cash

No other payment method is required in MVP.

Payment method configuration may later become editable.

---

# 18.1 Payment Fields

Required:

- Client
- Amount
- Date
- Payment method

Optional:

- Receipt image
- Note
- Reference text

System-generated:

- Payment ID
- Created date
- Updated date

---

# 18.2 Receipt Storage

Receipt is optional.

Supported formats:

- JPG
- JPEG
- PNG
- PDF

Recommended maximum size:

10 MB per file.

Files should be copied into application data directory.

Do not rely on the original file remaining in Downloads/Desktop.

Database stores:

- Relative local file path
- Original filename
- File type

---

# 18.3 Payment Allocation

One payment may cover multiple obligations.

Example:

Client pays:

`10,000 EGP`

Allocation:

```text
6,000 → Marketing
2,500 → Studio Package
1,500 → Reels
```

Payment remains one real payment record.

It contains multiple allocation records.

---

# 18.4 Allocation Rules

Formula:

```text
Allocated Amount <= Payment Amount
```

If:

```text
Payment Amount = 10,000
Allocated = 8,000
```

Remaining:

`2,000 Unallocated Client Credit`

The system may allow temporary unallocated credit.

Client profile shows:

> Unallocated Credit: 2,000 EGP

It can later be assigned to another service.

---

# 18.5 Over-Allocation

Do not allow:

```text
Payment = 10,000
Allocations = 11,000
```

Show validation error.

---

# 18.6 Partial Payment

Every billable item supports partial payment.

Example:

```text
Due:
6,000

Paid:
4,000

Remaining:
2,000

Status:
Partial
```

---

# 18.7 Payment Correction

Financial records should not be permanently deleted by accident.

Recommended actions:

- Edit note/receipt
- Void payment
- Replace incorrect payment with corrected payment

Void requires reason.

Example:

> Wrong amount entered.

A simple activity log stores this action.

No full accounting reversal engine is required.

---

# 19. Outstanding Balance

Outstanding is calculated from billable obligations.

Examples:

- Marketing month
- Website
- Subscription month
- Package
- One-off Studio booking
- Extra Studio hours

Formula:

```text
Outstanding =
Billable Total - Allocated Payments
```

---

# 20. Expenses

Expenses remain intentionally simple.

---

# 20.1 Categories

Default:

- Salary
- Rent
- Studio
- Ads
- Software
- Equipment
- Transport
- Domains
- Other

---

# 20.2 Expense Fields

Required:

- Amount
- Date
- Category

Optional:

- Description
- Note
- Receipt

If category is:

`Other`

Description becomes required.

Example:

> Office maintenance

---

# 20.3 Expense List

Columns:

- Date
- Category
- Description
- Amount

Filters:

- Date range
- Category

---

# 21. Reports

Reports should remain operational rather than accounting-heavy.

---

# 21.1 Monthly Summary

Display:

```text
Money In
Expenses
Difference
Outstanding
```

---

# 21.2 Income by Service

Examples:

- Marketing
- Studio
- Websites
- Subscription
- Custom

Use actual payment allocations, not merely contract values.

---

# 21.3 Outstanding Report

Columns:

- Client
- Service
- Due amount
- Paid
- Remaining
- Due date
- Status

---

# 21.4 Package Balance Report

Columns:

- Client
- Package
- Hours purchased
- Hours used
- Hours reserved
- Hours available
- Reels purchased
- Reels used
- Reels remaining

---

# 21.5 Studio Usage Report

By date range:

- Number of bookings
- Total planned hours
- Total actual hours
- Cancelled bookings
- Package hours used
- Single booking hours

---

# 21.6 Client Statement

Client profile can generate a readable statement containing:

- Purchases
- Payments
- Remaining money
- Packages
- Remaining hours
- Remaining reels

Export to PDF is post-MVP unless easy to implement.

---

# 22. Search

Global search should find:

- Client
- Phone
- Website project
- Package
- Booking

Selecting result navigates directly to corresponding record.

---

# 23. Filters

Common date filters:

- Today
- This Week
- This Month
- Last Month
- Custom Range

Common state filters:

- Paid
- Partial
- Overdue
- Active
- Completed
- Cancelled

---

# 24. Notifications

MVP notifications are internal only.

Examples:

- Payment overdue
- Payment due today
- Booking today
- Booking starting soon
- Package balance low
- Contract ending soon

No:

- WhatsApp automation
- SMS
- Email

in MVP.

---

# 25. Business Rules Summary

## BR-001

One Client may own multiple services.

## BR-002

One Client may own multiple active packages.

## BR-003

One package may contain multiple entitlement types.

## BR-004

Core entitlement types are HOURS and REELS.

## BR-005

Money balance and service balance are independent.

## BR-006

Package template changes never modify previously sold packages.

## BR-007

Studio hours support decimal values.

## BR-008

Internally store studio time in minutes.

## BR-009

Studio booking always has From and To.

## BR-010

Actual duration determines consumed studio hours.

## BR-011

Future package bookings reserve hours.

## BR-012

Cancelled bookings release reserved hours.

## BR-013

One booking may contain multiple reels.

## BR-014

One reel may connect to one booking where relevant.

## BR-015

Reel consumption does not automatically consume hours.

## BR-016

Hour consumption does not automatically consume reels.

## BR-017

Marketing is normally billed monthly.

## BR-018

Marketing overdue balance does not automatically pause service.

## BR-019

Website payment stages are flexible.

## BR-020

One payment may be allocated to multiple services.

## BR-021

Allocations cannot exceed payment value.

## BR-022

Unused payment money becomes client credit.

## BR-023

Payment receipt is optional.

## BR-024

Payment note is optional.

## BR-025

Studio deposit is optional.

## BR-026

Studio booking conflicts must be detected.

## BR-027

No price should be globally hard-coded into historical records.

## BR-028

Expenses remain simple operational records.

---

# 26. Data Model

Recommended entities:

```text
Client

ServiceDefinition

MarketingContract
MarketingMonthlyDue
MarketingExtra

Subscription
SubscriptionMonthlyDue

WebsiteProject

PackageTemplate
PackageTemplateItem

ClientPackage
ClientPackageItem

StudioBooking
RecurringBookingRule

ReelItem

Payment
PaymentAllocation

Expense

Attachment

ActivityLog

AppSetting
```

---

# 27. TypeScript Domain Types

Suggested conceptual types:

```ts
type ID = string;

type Money = number;

type PaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "overdue";

type BookingStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

type ServiceBillingModel =
  | "monthly"
  | "project"
  | "hourly"
  | "package"
  | "one_off"
  | "custom";

type PackageUnit =
  | "hours"
  | "reels";

interface Client {
  id: ID;
  name: string;
  companyName?: string;
  phone?: string;
  secondaryPhone?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

# 28. Service Definition

```ts
interface ServiceDefinition {
  id: ID;
  name: string;
  billingModel: ServiceBillingModel;
  description?: string;
  active: boolean;
  createdAt: string;
}
```

---

# 29. Package Types

```ts
interface PackageTemplate {
  id: ID;
  name: string;
  defaultPrice?: Money;
  active: boolean;
}

interface PackageTemplateItem {
  id: ID;
  packageTemplateId: ID;
  unit: PackageUnit;
  quantity: number;
}

interface ClientPackage {
  id: ID;
  clientId: ID;
  packageTemplateId?: ID;

  nameSnapshot: string;
  soldPrice: Money;

  purchasedAt: string;

  status:
    | "not_started"
    | "active"
    | "fully_used"
    | "cancelled";
}

interface ClientPackageItem {
  id: ID;
  clientPackageId: ID;

  unit: PackageUnit;

  purchasedQuantity: number;
  usedQuantity: number;
  reservedQuantity: number;
}
```

For hours:

Quantities should preferably use minutes internally.

Alternative specialized type:

```ts
interface StudioHourEntitlement {
  purchasedMinutes: number;
  usedMinutes: number;
  reservedMinutes: number;
}
```

---

# 30. Studio Booking Type

```ts
interface StudioBooking {
  id: ID;

  clientId: ID;

  date: string;

  plannedStart: string;
  plannedEnd: string;

  plannedMinutes: number;

  actualStart?: string;
  actualEnd?: string;

  actualMinutes?: number;

  clientPackageId?: ID;

  recurringRuleId?: ID;

  status: BookingStatus;

  bookingPrice?: Money;

  depositRequired: boolean;
  depositAmount?: Money;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}
```

---

# 31. Reel Type

```ts
interface ReelItem {
  id: ID;

  clientId: ID;

  clientPackageId?: ID;

  studioBookingId?: ID;

  status:
    | "available"
    | "planned"
    | "filmed"
    | "completed"
    | "cancelled";

  notes?: string;

  createdAt: string;
}
```

---

# 32. Payment Types

```ts
type PaymentMethod =
  | "cash"
  | "vodafone_cash";

interface Payment {
  id: ID;

  clientId: ID;

  amount: Money;

  method: PaymentMethod;

  date: string;

  note?: string;

  receiptAttachmentId?: ID;

  status:
    | "active"
    | "void";

  createdAt: string;
}

interface PaymentAllocation {
  id: ID;

  paymentId: ID;

  targetType:
    | "marketing_due"
    | "subscription_due"
    | "website_project"
    | "client_package"
    | "studio_booking"
    | "custom";

  targetId: ID;

  amount: Money;
}
```

---

# 33. Marketing Types

```ts
interface MarketingContract {
  id: ID;

  clientId: ID;

  monthlyAmount: Money;

  startDate: string;
  endDate?: string;

  status:
    | "draft"
    | "active"
    | "paused"
    | "ended"
    | "cancelled";

  notes?: string;
}

interface MarketingMonthlyDue {
  id: ID;

  contractId: ID;

  year: number;
  month: number;

  baseAmount: Money;

  dueDate: string;

  status: PaymentStatus;
}
```

---

# 34. Website Type

```ts
interface WebsiteProject {
  id: ID;

  clientId: ID;

  name: string;

  totalPrice: Money;

  startDate: string;

  expectedDeliveryDate?: string;

  nextPaymentAmount?: Money;
  nextPaymentDate?: string;

  status:
    | "new"
    | "in_progress"
    | "waiting"
    | "completed"
    | "cancelled";

  notes?: string;
}
```

---

# 35. Expense Type

```ts
type ExpenseCategory =
  | "salary"
  | "rent"
  | "studio"
  | "ads"
  | "software"
  | "equipment"
  | "transport"
  | "domains"
  | "other";

interface Expense {
  id: ID;

  amount: Money;

  date: string;

  category: ExpenseCategory;

  description?: string;

  note?: string;

  receiptAttachmentId?: ID;

  createdAt: string;
}
```

---

# 36. Recommended Database

Use:

# SQLite

Reasons:

- Single local device
- No server needed
- Mature
- Reliable
- Easy backup
- Excellent for relational financial/business data
- Works well with Tauri
- Can later migrate if necessary

Do not use browser LocalStorage as the primary database.

Do not use IndexedDB as the main financial database unless there is a specific architectural reason.

---

# 37. Recommended Desktop Architecture

```text
┌────────────────────────────────┐
│ React + TypeScript UI          │
│                                │
│ Dashboard                      │
│ Clients                        │
│ Studio                         │
│ Payments                       │
│ Expenses                       │
│ Reports                        │
└───────────────┬────────────────┘
                │
         Typed Commands
                │
┌───────────────▼────────────────┐
│ Tauri Desktop Layer            │
│                                │
│ Database services              │
│ File storage                   │
│ Backup                         │
│ Native dialogs                 │
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│ SQLite                         │
│                                │
│ App Data                       │
└────────────────────────────────┘
```

---

# 38. Application Data Folder

Recommended structure:

```text
SparkManager/
│
├── spark.db
│
├── attachments/
│   ├── payments/
│   └── expenses/
│
├── backups/
│
└── logs/
```

---

# 39. Backup System

Backup is mandatory because the application is local.

---

# 39.1 Manual Backup

Settings:

`Backup Now`

Backup should include:

- SQLite database
- Receipt attachments
- Application settings

Create single compressed backup file.

Example:

```text
spark-backup-2026-09-06.zip
```

---

# 39.2 Automatic Backup

Create automatic backup:

- Once per day when app opens, if today's backup does not exist.

Keep:

- Latest 30 daily backups

Retention may later become configurable.

---

# 39.3 Restore Backup

Settings:

`Restore Backup`

Before restore:

1. Warn user.
2. Automatically create backup of current state.
3. Restore selected backup.
4. Restart/reload application.

---

# 40. Data Safety

Any destructive action should require confirmation.

Examples:

- Cancel booking
- End contract
- Void payment
- Delete package template

Records that contain financial history should preferably become inactive/void instead of permanently deleted.

---

# 41. Activity Log

Maintain lightweight log for important operations.

Examples:

```text
Payment created
Payment voided
Booking cancelled
Booking completed
Package balance changed
Contract ended
```

Fields:

- Action
- Entity type
- Entity ID
- Timestamp
- Optional note

This is not intended as an enterprise audit system.

It primarily helps recover from accidental mistakes.

---

# 42. UI Direction

The application is an internal business tool.

Prioritize:

- Clear hierarchy
- Large readable numbers
- Fast data entry
- Strong contrast
- Low visual clutter
- Arabic RTL correctness

Spark identity may influence accent styling, but usability comes first.

Recommended visual system:

- Warm/light background
- Near-black text
- Spark orange as accent
- Neutral status colors
- Clear table/card hierarchy

The interface must not look like a social media design.

---

# 43. RTL

Primary Arabic layouts use:

```css
direction: rtl;
```

Numeric values and time fields must remain visually understandable.

Use proper handling for mixed Arabic + numbers.

---

# 44. Forms UX

Every major creation form should support:

- Save
- Cancel
- Validation messages
- Keyboard navigation

Do not clear form when validation fails.

---

# 45. Validation Rules

Examples:

### Money

Must be:

`>= 0`

### Package Quantity

Must be:

`> 0`

### Booking

End time must be after start time.

### Payment Allocation

Allocation total cannot exceed payment amount.

### Other Expense

Description required.

### Client

Name required.

### Contract

Monthly amount required.

### Website

Total price required.

---

# 46. Empty States

Examples:

### No Studio Bookings

> مفيش حجوزات Studio النهاردة.

Button:

`إضافة حجز`

### No Clients

> لسه مفيش عملاء مسجلين.

Button:

`إضافة أول عميل`

### No Outstanding

> مفيش مبالغ متأخرة حاليًا.

---

# 47. Error Handling

Database errors should never display technical stack traces to Safaa.

User-facing message:

> حصلت مشكلة أثناء حفظ البيانات. حاول مرة أخرى.

Technical details may be written to local logs.

---

# 48. Core Calculations

## Client Financial Balance

```text
Total Outstanding =
Sum(all client billable balances)
```

---

## Package Remaining Hours

```text
Remaining =
Purchased - Used
```

---

## Package Available Hours

```text
Available =
Purchased - Used - Reserved
```

---

## Package Remaining Reels

```text
Remaining Reels =
Purchased Reels - Used Reels
```

---

## Website Remaining

```text
Remaining =
Project Price - Allocated Payments
```

---

## Monthly Marketing Remaining

```text
Remaining =
Monthly Base
+ Extras
- Allocated Payments
```

---

## Cash Difference

```text
Money Received
-
Expenses
```

---

# 49. Core User Flows

---

## Flow A — New Marketing Client

```text
Create Client
↓
Add Marketing Contract
↓
Enter Monthly Price
↓
Set Start / End Dates
↓
Monthly Due Generated
↓
Client Pays
↓
Add Payment
↓
Allocate to Marketing Month
↓
Month Status = Paid
```

---

## Flow B — Website

```text
Client
↓
Create Website Project
↓
Enter Total Price
↓
Receive Partial Payment
↓
Allocate Payment
↓
Remaining Updated
↓
Enter Next Payment if known
↓
Receive Final Payment
↓
Remaining = 0
```

---

## Flow C — Single Studio Session

```text
Client
↓
New Booking
↓
Date
↓
From / To
↓
Conflict Check
↓
Optional Deposit
↓
Save
↓
Session Happens
↓
Enter Actual End
↓
Complete Booking
↓
Record Payment if required
```

---

## Flow D — Studio Hour Package

```text
Client
↓
Sell Package
↓
10 Hours
↓
Record Payment
↓
Create Booking
↓
Reserve Planned Hours
↓
Complete Booking
↓
Actual Hours Consumed
↓
Remaining Balance Updated
```

---

## Flow E — Reels Package

```text
Client
↓
Sell 3 Reel Package
↓
Create Reel Items
↓
Link Reel(s) to Booking
↓
Film
↓
Mark Reel Completed
↓
Used Reels Updated
```

---

## Flow F — Package C

```text
Sell Mixed Package
↓
10 Hours
+
3 Reels
↓
Record Payment
↓

Booking 1:
4.5 Actual Hours
+
1 Reel Completed
↓

Balances:

Hours:
5.5 Remaining

Reels:
2 Remaining
```

---

## Flow G — Multiple Reels One Day

```text
Client Has:
3 Reels

Create One Studio Booking
↓
Link:
Reel 1
Reel 2
Reel 3
↓
Film All
↓
Mark Individual Reels Complete
↓
Reel Balance = 0
```

---

## Flow H — Split Payment

```text
Receive 10,000
↓
Payment Method: Cash
↓

Allocate:

6,000 Marketing
2,500 Studio
1,500 Reels
↓

Payment Fully Allocated
```

---

# 50. Important Edge Cases

## EC-001 — Client Pays Before Due Date

Allowed.

Payment may be allocated to upcoming obligation.

---

## EC-002 — Client Pays Less

Set obligation:

`Partial`

---

## EC-003 — Client Pays More

Excess becomes:

`Client Credit`

---

## EC-004 — Booking Gets Longer

Use actual duration.

---

## EC-005 — Booking Gets Shorter

Only actual duration is consumed.

---

## EC-006 — Cancelled Package Booking

Reserved balance returns.

---

## EC-007 — Same Client Has Multiple Packages

When creating booking, Safaa selects which package to use.

---

## EC-008 — Package Reaches Zero Hours But Has Reels

Package remains active until all included entitlements are used or manually ended.

---

## EC-009 — Reels Finish But Hours Remain

Same rule.

---

## EC-010 — Marketing Contract Overdue

Remain active unless manually paused.

---

## EC-011 — Contract Price Changes

Recommended behavior:

End existing price period and create updated price effective from selected month.

Never retroactively alter old monthly dues.

---

## EC-012 — Package Template Price Changes

Existing client packages unchanged.

---

## EC-013 — Receipt File Original Deleted

Safe because app copied attachment into own application directory.

---

## EC-014 — Recurring Booking Conflicts

Skip or resolve conflicted dates before final creation.

---

# 51. Non-Goals — MVP

Explicitly exclude:

- Cloud sync
- Web application
- Mobile application
- Multi-user collaboration
- User roles
- Employee payroll system
- Full accounting
- Taxes
- Inventory
- CRM sales pipeline
- WhatsApp automation
- Email automation
- Invoice compliance system
- Supplier management
- Advanced profit allocation
- Bank integrations
- Payment gateway integrations
- Online booking for clients
- Client portal
- 3arrab student wallet accounting

---

# 52. Technical Frontend Structure

Recommended React feature architecture:

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers/
│
├── features/
│   ├── dashboard/
│   ├── clients/
│   ├── marketing/
│   ├── subscriptions/
│   ├── websites/
│   ├── studio/
│   ├── packages/
│   ├── reels/
│   ├── payments/
│   ├── expenses/
│   ├── reports/
│   └── settings/
│
├── components/
│   ├── ui/
│   ├── forms/
│   ├── tables/
│   └── layout/
│
├── domain/
│   ├── client.ts
│   ├── payment.ts
│   ├── booking.ts
│   ├── package.ts
│   └── calculations.ts
│
├── lib/
│
├── hooks/
│
├── utils/
│
└── types/
```

Prefer feature-oriented architecture instead of placing every component in one global components folder.

---

# 53. State Management

Most persistent business state belongs in SQLite.

React should not become the permanent source of truth.

Recommended:

- Local component state for forms
- Query/cache layer for fetched records
- Small global UI state only where necessary

Avoid maintaining duplicated financial calculations in global state.

Central calculation functions should exist in domain layer.

---

# 54. Database Constraints

Use foreign keys.

Examples:

```text
PaymentAllocation.paymentId
→ Payment.id

StudioBooking.clientId
→ Client.id

ClientPackage.clientId
→ Client.id
```

Use transactions for operations that modify several records together.

Example:

Completing package Studio booking:

```text
BEGIN

Update booking
Release reservation
Add actual usage
Update package status

COMMIT
```

If one step fails:

`ROLLBACK`

---

# 55. Date and Time

Store:

- Dates in ISO `YYYY-MM-DD`
- Timestamps in ISO datetime
- Studio time consistently

Display UI in local Egyptian time.

Do not depend on browser locale for financial date interpretation.

---

# 56. Money Storage

Avoid floating money calculations.

Store EGP using smallest useful unit.

Recommended:

`integer piasters`

Example:

```text
1500 EGP
=
150000 piasters
```

UI converts it back to EGP.

This prevents floating-point money errors.

---

# 57. Performance Requirements

Dataset is expected to remain relatively small.

Target:

- Dashboard initial load under approximately 1 second on normal local hardware after startup.
- Client search should feel immediate.
- Calendar navigation should not visibly lag.
- Saving a payment or booking should complete immediately under normal circumstances.

No complex scaling architecture is required.

---

# 58. Accessibility / Usability

Minimum:

- Keyboard-accessible controls
- Clear focus states
- Proper form labels
- Status not conveyed by color alone
- Readable font sizes
- High contrast
- Confirmation before destructive operations

---

# 59. MVP Implementation Order

## Phase 1 — Foundation

Build:

- Tauri shell
- React
- TypeScript
- SQLite
- App layout
- Routing
- Database migrations
- Backup foundation

---

## Phase 2 — Clients

Build:

- Client list
- Create/edit client
- Client profile
- Search

---

## Phase 3 — Payments + Expenses

Build:

- Payments
- Payment allocations
- Receipts
- Client outstanding
- Expenses

---

## Phase 4 — Marketing + Website + Subscription

Build:

- Marketing contracts
- Monthly dues
- Extras
- Websites
- Monthly subscriptions

---

## Phase 5 — Packages

Build:

- Package templates
- Package C support
- Client package purchases
- Hours
- Reels
- Service balances

---

## Phase 6 — Studio

Build:

- Calendar
- Single bookings
- Recurring bookings
- Conflicts
- Planned vs actual time
- Package reservation
- Package consumption
- Reel links

---

## Phase 7 — Dashboard

Only after underlying data is reliable.

Build:

- Today's bookings
- Collections due
- Overdue
- Month summary
- Package warnings
- Upcoming

---

## Phase 8 — Reports

Build:

- Monthly summary
- Income by service
- Outstanding
- Package balances
- Studio usage

---

## Phase 9 — Hardening

Build/test:

- Backup restore
- Validation
- Empty states
- Error handling
- Activity log
- Data integrity tests

---

# 60. MVP Definition of Done

The system is considered MVP-complete when Safaa can perform the following without using another spreadsheet for daily Spark operations:

1. Add a client.
2. Give the client one or more services.
3. Create Marketing monthly contract.
4. Track each Marketing month as paid/partial/outstanding.
5. Add Marketing extras.
6. Create Website project.
7. Track website total/paid/remaining.
8. Create monthly subscription.
9. Create Studio hour package.
10. Create Reel package.
11. Create Package C with hours + reels.
12. Track package financial balance.
13. Track hour balance independently.
14. Track reel balance independently.
15. Create single Studio booking.
16. Create recurring Studio booking.
17. Prevent overlapping bookings.
18. Record actual Studio duration.
19. Consume package hours correctly.
20. Restore hours after cancellation.
21. Link multiple reels to one booking.
22. Link reels across separate bookings.
23. Record Cash payment.
24. Record Vodafone Cash payment.
25. Attach optional receipt.
26. Add optional note.
27. Split one payment across several services.
28. Track unpaid balances.
29. Add an expense.
30. See today's bookings.
31. See outstanding payments.
32. See package remaining balances.
33. See monthly income/expense.
34. Backup all local data.
35. Restore backup successfully.

---

# 61. Acceptance Test Scenarios

## Test 1 — Package C

Create:

```text
10 Hours
3 Reels
Price: 4,000
```

Pay 4,000.

Complete:

```text
4.5 hour session
1 reel
```

Expected:

```text
Money Remaining = 0
Hours Remaining = 5.5
Reels Remaining = 2
```

---

## Test 2 — Recurring Studio

Create:

```text
Every Saturday
4 PM → 6 PM
September
```

Expected:

All Saturdays generated unless conflict exists.

---

## Test 3 — Extended Session

Package:

`10 hours`

Completed previous:

`6.5 hours`

Remaining:

`3.5`

Booking:

`2 hours planned`

Actual:

`2.5`

Expected:

Remaining:

`1 hour`

---

## Test 4 — Cancel Booking

Before cancellation:

```text
Package Available = 8 hours
Booking reserves 2 hours
Available to Book = 6 hours
```

Cancel.

Expected:

`Available = 8 hours`

---

## Test 5 — Marketing Partial

Monthly:

`6,000`

Pay:

`4,000`

Expected:

```text
Paid = 4,000
Remaining = 2,000
Status = Partial
```

After due date:

`Status = Overdue/Partial Overdue`

Contract stays active.

---

## Test 6 — Split Payment

Payment:

`10,000`

Allocate:

```text
6,000 Marketing
2,500 Studio
1,500 Reel Package
```

Expected:

Payment remaining unallocated:

`0`

All three balances update.

---

## Test 7 — Payment Credit

Payment:

`10,000`

Allocated:

`8,000`

Expected:

Client credit:

`2,000`

---

## Test 8 — Double Booking

Existing:

`4 PM → 6 PM`

Attempt:

`5 PM → 7 PM`

Expected:

Save blocked with conflict warning.

---

# 62. Future Enhancements

Possible V2 additions:

- Owner dashboard mode
- User login
- Safaa vs management permissions
- WhatsApp reminders
- Client invoices
- PDF statements
- Excel export
- Excel import from legacy tracker
- Cloud backup
- Multi-device sync
- Mobile companion
- Automated recurring monthly billing generation
- Advanced Studio analytics
- Studio equipment management
- Staff payments
- Revenue forecasting
- Client profitability
- Client portal
- Booking confirmations

These should not delay MVP.

---

# 63. Recommended Codex Implementation Rule

This PRD should be treated as the **functional source of truth**.

When implementation ambiguity occurs:

Priority:

1. Current explicit user instruction.
2. Business rules in this PRD.
3. Data integrity.
4. Simplicity for Safaa.
5. Technical elegance.

Codex must not invent:

- New accounting modules
- New business rules
- Hard-coded service prices
- Extra payment methods
- Package deduction behavior
- User roles
- Cloud architecture

without explicit requirement.

---

# 64. Final Product Mental Model

The entire product can be understood through five relationships:

```text
CLIENT
   │
   ├── buys SERVICE
   │
   ├── may receive BILL / OBLIGATION
   │
   ├── makes PAYMENT
   │
   ├── may own PACKAGE
   │       ├── Hours
   │       └── Reels
   │
   └── may create STUDIO BOOKINGS
```

And Spark separately records:

```text
EXPENSES
```

The application then turns this into:

```text
TODAY
WHAT IS BOOKED?

MONEY
WHO PAID?
WHO STILL OWES?

SERVICE
WHO STILL HAS HOURS?
WHO STILL HAS REELS?

MONTH
HOW MUCH CAME IN?
HOW MUCH WENT OUT?
```

That is the intended scope of Spark Finance & Studio Manager v1.0.

---

# 65. Final Architecture Decision

Recommended initial stack:

```text
Desktop Runtime
Tauri

Frontend
React
TypeScript

Database
SQLite

Storage
Local filesystem

Primary UX
Arabic RTL

Data Model
Relational

Core Strategy
Offline-first
Local-first
Single-device
```

The architecture deliberately avoids a backend server because the current product is a local internal application.

The domain layer should nevertheless remain independent enough that a future cloud backend could replace SQLite without rewriting the complete UI.

---

# 66. Final Non-Negotiables

The implementation must never:

- Mix money balance with service balance.
- Assume one reel equals one hour.
- Assume one booking equals one reel.
- Assume all reels are filmed on different days.
- Assume all reels are filmed on the same day.
- Assume Studio is monthly.
- Assume Website payments follow fixed percentages.
- Stop Marketing automatically because of unpaid money.
- Require deposit on every booking.
- Restrict hours to whole numbers.
- Modify historical packages when template changes.
- Modify historical prices when service prices change.
- Allow overlapping Studio bookings silently.
- Lose package balance when a booking is cancelled.
- Treat one payment covering several services as several unrelated cash payments.
- Depend on internet connection for core operation.
- Store financial data only in browser LocalStorage.
- Lose all company records because the laptop has no backup.

The implementation must always preserve:

> **Client → Money → Service Balance → Booking → Clear Current State.**