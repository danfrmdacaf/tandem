# Tandem

Tandem is a shared calendar for two people or a small group. Each person has a colour, so it is easy to see who is busy and when everyone is free together. It works on a laptop, an iPad and a phone, it can be installed on the home screen, and nobody needs to create an account.

Built by Daniel Chidi, Founder, Adachi Industries.

Open the application: https://danfrmdacaf.github.io/tandem/

## What it does

- **Shared calendars.** Month, week and agenda views. Each person chooses a colour, and events carry the colour of the people they are for. An event for two people is drawn with a split bar.
- **A Home page with widgets.** Six widgets: Today, Next up, Countdown, This week, Free together and Month. Each can be small, medium or large, and each comes in three designs: plain, bold and outline. The Free together widget shows which days in the coming week are completely free and which are free from the evening.
- **Flexible events.** All day or timed, spanning several days, repeating every day, every week, every two weeks, every month or every year, with an optional end date, a place and notes.
- **Several calendars.** One device can hold more than one calendar, for example one for a couple and one for a family.
- **Showing one calendar on another.** A person can choose to show their own calendar on a shared one, either with the titles and places or as busy times only. The people in the shared calendar can see those events but cannot change them, and anything they add stays in the shared calendar. See the section on showing a calendar on another calendar below.
- **Bringing in a calendar file.** A file ending in .ics, for example from a university timetable, Google Calendar or the Calendar application on a Mac, can be added to a calendar. A preview is shown first, and choosing the same file again updates the events instead of duplicating them.
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

## Privacy and security

- There are no accounts. Tandem does not ask for an email address, a password or a phone number.
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
2. Apply the database migrations in `supabase/migrations/`, in order.
3. Deploy the function in `supabase/functions/tandem/` with the option that requires a signed in user switched off. The function reads its database credentials from the environment that the platform provides.
4. Put the address of the deployed function in `config.js`.
5. Publish the files in this folder with any static host. GitHub Pages works well.

To keep a free Supabase project from pausing after a week without use, `.github/workflows/keepalive.yml` requests the health address every three days. GitHub stops scheduled workflows after sixty days without activity in a repository, so run the workflow by hand from time to time if the repository is otherwise quiet.

## Tests

```
node tests/core.test.mjs
```

The tests cover repeating events, events that span several days, free time detection, the checking of event input and the reading of calendar files.

## About

Tandem is designed and built by Daniel Chidi, Founder of Adachi Industries.

Copyright 2026 Adachi Industries. All rights reserved.
