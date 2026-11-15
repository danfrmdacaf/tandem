# Tandem

Tandem is a shared calendar for two people or a small group. Each person has a colour, so it is easy to see who is busy and when everyone is free together. It works on a laptop, an iPad and a phone, it can be installed on the home screen, and nobody needs to create an account.

Built by Daniel Chidi, Founder, Adachi Industries.

Open the application: https://danfrmdacaf.github.io/tandem/

## What it does

- **Shared calendars.** Month, week and agenda views. Each person chooses a colour, and events carry the colour of the people they are for. An event for two people is drawn with a split bar.
- **A Home page with widgets.** Six widgets: Today, Next up, Countdown, This week, Free together and Month. Each can be small, medium or large, and each comes in three designs: plain, bold and outline. The Free together widget shows which days in the coming week are completely free and which are free from the evening.
- **Flexible events.** All day or timed, spanning several days, repeating every day, every week, every two weeks, every month or every year, with an optional end date, a place and notes.
- **Several calendars.** One device can hold more than one calendar, for example one for a couple and one for a family.
- **Works without a connection.** Every calendar is kept on the device. Changes made offline are sent when the connection returns.
- **Calendar subscription.** A read only address that can be added to the Calendar application on an iPhone, an iPad, a Mac or an Android phone. See the section on widgets below.
- **Installable.** Add it to the home screen of a phone or tablet, or to the Dock of a Mac, and it opens like any other application, with its own icon.

## How people join

1. One person creates a calendar and chooses a name, a name for themselves and a colour.
2. That person opens Settings and sends the invitation link, or shows a short code.
3. The other person opens the link, or chooses Join and types the code. They are asked who they are. A person who is already in the calendar and is opening it on another device chooses their own name, so nobody appears twice.

The link can be sent by any means, including email. To use a calendar on another of your own devices, email the link to yourself and open it there.

On an iPhone or iPad, an application added to the Home Screen keeps its own copy of the data, separate from Safari. After adding Tandem to the Home Screen, open it and join again with the invitation link or a short code.

## Privacy and security

- There are no accounts. Tandem does not ask for an email address, a password or a phone number.
- Each calendar has a secret key, which is part of the invitation link. Anyone who has the link can read and change that calendar, so it should be shared only with people you trust.
- The key sits after the hash symbol in the address, which browsers never send to a server. It is removed from the address bar as soon as a person has joined.
- The server stores only a one way hash of each key. The one exception is a short code: while a code is waiting to be used, the key it points to is held for at most ten minutes and is then deleted. Each code works once.
- The calendar subscription address is a separate, read only token. It cannot be used to change the calendar.
- This application contains no database key or password of any kind. It talks to one small server function, and the function is the only part that can reach the database. The database refuses every direct request: row level security is switched on and no public policy exists.
- Limits protect the free service: five thousand events for each calendar, and three hundred new calendars each day for the whole service.

## About widgets

A website cannot place a widget on the home screen of an iPhone, an iPad or an Android phone. That ability belongs to native applications. Tandem offers two things instead:

1. The Home page inside Tandem, with the widget designs described above. Choose Edit Home to add, remove, resize, restyle and reorder them.
2. A calendar subscription. Add the subscription address from Settings to the Calendar application on your device. The widgets that come with that application will then show your Tandem events, and they update by themselves.

## Running your own copy

The application is a set of plain files with no build step. The storage is a small Supabase project.

1. Create a Supabase project.
2. Apply the database migration in `supabase/migrations/`.
3. Deploy the function in `supabase/functions/tandem/` with the option that requires a signed in user switched off. The function reads its database credentials from the environment that the platform provides.
4. Put the address of the deployed function in `config.js`.
5. Publish the files in this folder with any static host. GitHub Pages works well.

To keep a free Supabase project from pausing after a week without use, `.github/workflows/keepalive.yml` requests the health address every three days. GitHub stops scheduled workflows after sixty days without activity in a repository, so run the workflow by hand from time to time if the repository is otherwise quiet.

## Tests

```
node tests/core.test.mjs
```

The tests cover repeating events, events that span several days, free time detection and the checking of event input.

## About

Tandem is designed and built by Daniel Chidi, Founder of Adachi Industries.

Copyright 2026 Adachi Industries. All rights reserved.
