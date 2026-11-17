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
- **Reminders.** A notification a chosen number of minutes before a timed event starts (5, 10, 15, 30 or 60), on an iPhone, an iPad, a Mac or any computer, even when Tandem is closed. Each device is switched on separately in Settings. Events marked optional or hidden, and all day events, never send one. See the section on reminders below.
- **Search and export.** Search across titles, places, notes and booking references, and download any calendar as a file that opens in any calendar application.
- **Works without a connection.** Every calendar is kept on the device. Changes made offline are sent when the connection returns.
- **Calendar subscription.** A read only address that can be added to the Calendar application on an iPhone, an iPad, a Mac or an Android phone. See the section on widgets below.
- **Installable.** Add it to the home screen of a phone or tablet, or to the Dock of a Mac, and it opens like any other application, with its own icon.

## The interface

The Home page opens with a greeting and a one line summary of the day, then widgets: Next up, Today, Countdown, This week, Hours this week, Free days and Month. Each can be small, medium or large and shown plain, tinted or outlined, and all of them show the real calendar. Today draws a line for the current time, and This week places each event at its hour.

Tandem is laid out like an application. The top bar holds the calendar switcher, the Home, Calendar and Agenda tabs, search, the Add button and Settings. On a phone the same choices sit in a bar at the bottom, with Add in the middle. The Calendar tab offers a month, a week drawn against the hours, and a single day. On a large screen the selected day is shown beside the calendar, with quick actions for importing a file, adding a ticket and inviting someone. The Add menu is the one place to add an event, import a file, add a ticket, invite someone or create another calendar.

A banner and a Get the app button lead to an install guide written for the device in use. Where a browser allows it, one button installs Tandem. On an iPhone or an iPad, Apple does not allow a website to install itself, so the guide shows the Share and Add to Home Screen steps.

The service worker fetches files from the network first, so a new version is used on the next visit, and keeps a saved copy for use without a connection.

## Otto, the helper in the corner

Otto is a small otter in the corner of the screen. Click Otto and type what you want to plan, for example "dentist next Friday at 3pm" or "gym every Monday at 7am until 20 December". Otto shows the event and adds it only when Add is chosen. Otto can also say what is on ("what is on tomorrow") and find free days ("when am I free next week"). This works on every device with no setup, because the sentence is understood inside the page.

For harder wording, Otto can ask a model running on the same computer through Ollama. Nothing leaves the computer. In Otto's settings, switch on Ollama, check the connection and choose a model. Ollama must allow the page to reach it. On a Mac, run the first line in Terminal, then quit and reopen Ollama:

    launchctl setenv OLLAMA_ORIGINS "https://danfrmdacaf.github.io"
    ollama pull llama3

Safari blocks a web page from reaching a program on the same computer, so use Chrome, Edge or Firefox for Ollama. A phone or tablet cannot reach Ollama on a computer, and uses the built in understanding.

## Timetable PDFs drawn as boxes

A weekly timetable PDF such as the TimeEdit export draws each class as a box inside a column for each week. Tandem reads each box for its week, weekday, start and end times, room, course name and teacher, and adds every class on its own date. A PDF can cut long course names short, so a calendar file (.ics) from the timetable system gives exact names where it is offered.

## Staying signed in and staying current

Signing in is kept on the device for ninety days, and the time restarts each time Tandem is used, so closing and reopening Tandem does not sign anyone out. Tandem also asks the browser to keep its saved data. Each published version carries a build stamp in config.js. When Tandem is opened, or returned to, it compares its stamp with the published one. If a newer version exists it reloads itself straight away, unless the person is in the middle of something, in which case a banner offers the update. Before publishing a change, run `python3 scripts/bump-build.py` so the stamp changes.

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

## Reminders

Reminders use web push, the standard that lets a website send a notification when it is not open.

- **On an iPhone or an iPad** Tandem has to be on the Home Screen first (Share, then Add to Home Screen), and the device needs iOS or iPadOS 16.4 or newer. Open Tandem from the Home Screen, then switch reminders on in Settings and allow notifications when asked.
- **On a Mac or another computer** switch reminders on in Settings in Safari, Chrome, Edge or Firefox and allow notifications. The browser has to be running, but the Tandem page does not have to be open.
- **How it works.** A second edge function, `tandem-push`, stores each device that asked for reminders together with its time zone, the calendars it belongs to and its personal rules. Once a minute the database scheduler (pg_cron with pg_net) calls it. It finds the events that start within the chosen number of minutes, skips the ones the person has silenced, and sends an encrypted push message to the device. Each reminder is recorded, so nobody is told twice. The messages are encrypted for the device with the standard Web Push scheme and signed with a VAPID key, written with the Web Crypto interface so it runs in the edge runtime and in the tests.
- **Private by design.** The signing key and the scheduler secret sit in the `tandem_config` table, which only the server can read. The only part in this repository is the public half of the key. The server accepts push addresses only from the push services of Apple, Google, Mozilla and Microsoft.
- **Time zones.** Events are written as wall clock times, so each device tells the server its own time zone, and a reminder is worked out in that zone.

## Forgotten passwords: the recovery code

Nothing needs to be set up for this. When an account is created, Tandem shows a recovery code once, as four groups of five characters. It can be copied or downloaded. If the password is forgotten, the email address, the recovery code and a new password are entered on the sign in page, and the person is signed in. Each use gives a new code. A new code can be made at any time in Settings with the password. Only a hash of the code is stored, attempts are limited, and the answer is the same whether or not the account exists.

## Setting up the email that sends reset links (optional)

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
2. Apply the database migrations in `supabase/migrations/`, in order. The third one adds the optional accounts and the fourth adds reminders.
3. Deploy the functions in `supabase/functions/tandem/` and `supabase/functions/tandem-push/` with the option that requires a signed in user switched off. For reminders, generate a VAPID key pair (ECDSA, P-256), store the private key as JSON and a random shared secret in `tandem_config` under `vapid_private` and `tick_secret`, store the public key under `vapid_public`, and put the same public key in `config.js`. The function reads its database credentials from the environment that the platform provides.
4. Put the address of the deployed function in `config.js`.
5. Publish the files in this folder with any static host. GitHub Pages works well.

To keep a free Supabase project from pausing after a week without use, `.github/workflows/keepalive.yml` requests the health address every three days. GitHub stops scheduled workflows after sixty days without activity in a repository, so run the workflow by hand from time to time if the repository is otherwise quiet.

## Tests

```
npm test
```

The tests cover repeating events, events that span several days, free time detection, the checking of event input, the reading and writing of calendar files, the personal hide and optional rules, and the reading of CSV, Excel and PDF timetables and of travel tickets (including a PDF, an Apple Wallet pass and several booking layouts). The reminder tests check which events are due in different time zones, that the message encryption can be read back by a receiver written from the specification, that the VAPID signature verifies, and that the server copy of the calendar logic agrees with the application on hundreds of generated events.

## Third party code

`vendor/` holds pdf.js, which reads PDF files on the device when one is chosen. It is licensed under the Apache License 2.0, and the licence is included in that folder.

## About

Tandem is designed and built by Daniel Chidi, Founder of Adachi Industries.

Copyright 2026 Adachi Industries. All rights reserved.
