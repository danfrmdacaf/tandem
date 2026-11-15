# Tandem

Tandem is a shared calendar for two people or a small group. Each person has a colour, so it is easy to see who is busy and when everyone is free together. It works on a laptop, an iPad and a phone, it can be installed on the home screen, and it can be used with no account at all. An optional account keeps everything in step across every device.

Built by Daniel Chidi, Founder, Adachi Industries.

Open the application: https://danfrmdacaf.github.io/tandem/

## What it does

- **Shared calendars.** Month, week and agenda views. Each person chooses a colour, and events carry the colour of the people they are for. An event for two people is drawn with a split bar.
- **A Home page with widgets.** Six widgets: Today, Next up, Countdown, This week, Free together and Month. Each can be small, medium or large, and each comes in three designs: plain, bold and outline. The Free together widget shows which days in the coming week are completely free and which are free from the evening.
- **Flexible events.** All day or timed, spanning several days, repeating every day, every week, every two weeks, every month or every year, with an optional end date, a place and notes.
- **Several calendars.** One device can hold more than one calendar, for example one for a couple and one for a family.
- **Showing one calendar on another.** A person can choose to show their own calendar on a shared one, either with the titles and places or as busy times only. The people in the shared calendar can see those events but cannot change them, and anything they add stays in the shared calendar. See the section on showing a calendar on another calendar below.
- **Accounts, optional.** A person can sign up with an email address and a password, sign in on any device and reset a forgotten password by email. The account keeps their calendars, their Home page layout and their preferences, so everything is the same on a laptop, an iPad and a phone. Without an account, Tandem works exactly as before, with an invitation link.
- **Personal calendars.** An account can hold as many calendars as the person likes, for example a personal timetable, one shared with a partner and one for a team.
- **Importing a timetable or a list.** A CSV file, an Excel sheet (.xlsx), a PDF or a calendar file (.ics) can be added to a calendar. Tandem works out which column is which, or reads a weekly grid with weekdays across the top and times down the side, and shows what it found before anything is added. A timetable that gives only weekdays repeats every week between two dates. Choosing the same file again updates the events instead of duplicating them, and a whole import can be taken back in one step.
- **Optional and hidden events.** Choose any event and mark it as optional, or choose not to show it. A rule can cover one day, every repeat of an event, every event with the same title, or every event that starts at or after a time, for example the sessions after 1 pm each day. Optional events are shown softly and are left out of free time and countdowns. These rules change only what the person sees. Nobody else is told, and the event is not changed.
- **Travel tickets.** Choose a ticket that has been downloaded, as a PDF, an Apple Wallet pass or a calendar file, or paste the text of a booking email. Tandem reads the date, the times, the route, the booking reference and the seat, shows them for checking, and adds the journey to the calendar. The ticket file is kept with the event, so it can be downloaded again later, and a copy is kept on the device so it works without a signal. A ticket that is a picture is kept, and the times are typed in.
- **Search and export.** Search across titles, places, notes and booking references, and download any calendar as a file that opens in any calendar application.
- **Works without a connection.** Every calendar is kept on the device. Changes made offline are sent when the connection returns.
- **Calendar subscription.** A read only address that can be added to the Calendar application on an iPhone, an iPad, a Mac or an Android phone. See the section on widgets below.
- **Installable.** Add it to the home screen of a phone or tablet, or to the Dock of a Mac, and it opens like any other application, with its own icon.

## How people join

1. One person creates a calendar and chooses a name, a name for themselves and a colour.
2. That person opens Settings and sends the invitation link, or shows a short code.
3. The other person opens the link, or chooses Join and types the code. They are asked who they are. A person who is already in the calendar and is opening it on another device chooses their own name, so nobody appears twice.

The link can be sent by any means, including email. To use a calendar on another of your own devices, email the link to yourself and open it there.

On an iPhone or iPad, an application added to the Home Screen keeps its own copy of the data, separate from Safari. After adding Tandem to the Home Screen, open it and join again with the invitation link or a short code.

## Showing a calendar on another calendar

Suppose you keep a personal calendar with your lectures in it, and you also share a calendar with someone else. In the settings of the personal calendar, under the heading that offers to show it on another calendar, choose the shared calendar and then one of two options.

- **Show details.** The people in the shared calendar see the title and the place of each event.
- **Show as busy only.** They see only the times, labelled Busy. The title, the place and the notes are never sent to the shared calendar.

The choice belongs to the person who owns the personal calendar, and it can be changed or switched off at any time. The shared copy is always read only. Anything another person adds to the shared calendar stays there and never appears in your personal calendar. Because the server decides what is sent, the restriction does not depend on the device of the person looking.

## Accounts

An account is optional. Without one, a person uses an invitation link and the calendar is kept on the device.

- **What an account keeps.** The list of calendars the person belongs to, the layout of their Home page, and their optional and hidden rules. It also keeps ticket files, up to thirty files of about one and a half megabytes each, and these are visible only to the account that added them. Events themselves stay in the calendars, as before.
- **Passwords.** A password is never stored. Only a salted PBKDF2 hash (SHA-256, 600,000 rounds) is kept. Sign in is slowed after repeated wrong attempts, and the answer is the same whether or not an email address has an account.
- **Sessions.** Signing in gives the device a random token. Only a hash of that token is stored. A token lasts ninety days of use, and changing the password or resetting it signs out every other device.
- **Forgotten passwords.** A reset link is sent by email. It works once and expires after one hour. Only a hash of the link is stored.
- **What the server can see.** The keys of the calendars in an account are held in the account so that a new device can open them. They sit in the database, which only the server function can reach, and they are never returned to anyone except the signed in account. The events in a calendar are held in the same database as before.

## Setting up the email that sends reset links

Tandem sends mail through Resend (https://resend.com). It is optional: without it everything else works and the reset page says that email is not switched on.

1. Create a Resend account and add a domain that you own. Until a domain is verified, Resend delivers only to the email address of its own account, which is enough to test your own reset but not for other people.
2. Create an API key in Resend.
3. In the Supabase dashboard open Edge Functions, then Secrets, and add `RESEND_API_KEY` with that key and `MAIL_FROM` with a sender on the verified domain, for example `Tandem <hello@yourdomain.com>`. Optionally add `TANDEM_SITE` with the public address of the application if it is not on GitHub Pages.

The key lives only in the server environment. It is never in this repository or in the application.

## Privacy and security

- Accounts are optional. Without one, Tandem asks for nothing: no email address, no password and no phone number.
- Each calendar has a secret key, which is part of the invitation link. Anyone who has the link can read and change that calendar, so it should be shared only with people you trust.
- The key sits after the hash symbol in the address, which browsers never send to a server. It is removed from the address bar as soon as a person has joined.
- The server stores only a one way hash of each key. The one exception is a short code: while a code is waiting to be used, the key it points to is held for at most ten minutes and is then deleted. Each code works once.
- The calendar subscription address is a separate, read only token. It cannot be used to change the calendar.
- This application contains no database key or password of any kind. It talks to one small server function, and the function is the only part that can reach the database. The database refuses every direct request: row level security is switched on and no public policy exists.
- A calendar owner can replace the invitation link at any time. The old link, any waiting short code and the old subscription address stop working at once, so a link that has reached the wrong person can be withdrawn. People who should keep access then need the new link.
- When a calendar is shown on another calendar, the server sends only what the owner chose: the title and place, or only the times. Notes are never sent.
- Limits protect the free service: five thousand events for each calendar, and three hundred new calendars each day for the whole service.

## About widgets

A website cannot place a widget on the home screen of an iPhone, an iPad or an Android phone. That ability belongs to native applications. Tandem offers two things instead:

1. The Home page inside Tandem, with the widget designs described above. Choose Edit Home to add, remove, resize, restyle and reorder them.
2. A calendar subscription. Add the subscription address from Settings to the Calendar application on your device. The widgets that come with that application will then show your Tandem events, and they update by themselves.

## Running your own copy

The application is a set of plain files with no build step. The storage is a small Supabase project.

1. Create a Supabase project.
2. Apply the database migrations in `supabase/migrations/`, in order. The third one adds the optional accounts.
3. Deploy the function in `supabase/functions/tandem/` with the option that requires a signed in user switched off. The function reads its database credentials from the environment that the platform provides.
4. Put the address of the deployed function in `config.js`.
5. Publish the files in this folder with any static host. GitHub Pages works well.

To keep a free Supabase project from pausing after a week without use, `.github/workflows/keepalive.yml` requests the health address every three days. GitHub stops scheduled workflows after sixty days without activity in a repository, so run the workflow by hand from time to time if the repository is otherwise quiet.

## Tests

```
npm test
```

The tests cover repeating events, events that span several days, free time detection, the checking of event input, the reading and writing of calendar files, the personal hide and optional rules, and the reading of CSV, Excel and PDF timetables and of travel tickets (including a PDF, an Apple Wallet pass and several booking layouts).

## Third party code

`vendor/` holds pdf.js, which reads PDF files on the device when one is chosen. It is licensed under the Apache License 2.0, and the licence is included in that folder.

## About

Tandem is designed and built by Daniel Chidi, Founder of Adachi Industries.

Copyright 2026 Adachi Industries. All rights reserved.
