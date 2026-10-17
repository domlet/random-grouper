# random-grouper

Generate random groups from a list of people (or anything).

## What did I build?

[**random-grouper**](https://domlet.github.io/random-grouper) is a simple web app that plays noisy sounds while it generates small groups (any number) by randomly selecting names from a specified roster. 

| Grouping function | Pairing function |
| --- | --- |
| ![animated demonstration of grouping functionality](/assets/demo-groups.gif "Text to show on mouseover") | ![animated demonstration of pairing functionality](/assets/demo-pairs.gif "Text to show on mouseover") |
| Puts students into random groups. | Puts students into random pairs.  |


It displays numbered tables (represented as circles), and students can watch an animation as the app randomly places individual student names at each table. The animation lasts about 5 seconds, and many students experience excitement while it runs. When it finishes, students inevitably cry out with delight or dismay – and half the students beg for a re-run.

In regular grouping mode, table 3 is limited to two students; additional students are distributed among the other tables.

Anyone can [download and use it](https://domlet.github.io/random-grouper) with their own groups (without publishing PII such as student names on the Internet.) 

## What problem am I solving?

In my experience, it is not uncommon for students to dislike being placed in random groups. Yet, it is beneficial for students to learn and practice collaboration skills that work with unfamiliar people. 

As teachers, we are doing our job well when we can push students into their [zone of proximal development (ZPD)](https://en.wikipedia.org/wiki/Zone_of_proximal_development) where they are slightly uncomfortable.

Thus, random (or random-ish) groups are a learning tool that we sometimes need to use for learning activities.

I developed this app (**random-grouper**) as part of my teaching inquiry process, in which I aim to support an optimal affective state (the emotional equivalent of a 'growth mindset') for students during learning processes.

I have observed that the **random-grouper** app alleviates some student hatred by playing entertaining sound effects and adding suspense to the process. *Everything is more fun with sounds!* 

In the worst case scenario, the app also offers an easy way to regenerate groupings until a tolerable result is accepted and students agree to participate in an activity. *Aye, sometimes, the seas are rough...* 🏴‍☠️

## How can people use it?

Anyone can [download the source code](https://domlet.github.io/random-grouper) and use the app locally with their own groups (without publishing PII such as student names on the Internet.) 

### Follow these steps:

1. Download the files.
2. Run the app.
3. Update the rosters (use your own lists).
4. Run the app.
5. If you love it, [subscribe to my blog.](https://domlet.github.io/)

#### How to format your rosters.js

```
let rosters = {
  // Each roster is shaped like this:
  "AP Computer Science - 3rd": {
    // To prevent table neighbors from being paired...
    // Rosters have students listed by current table:
    tables: [
      {
        1: [
          "Rafidah E",
          "Earnest P",
          "Mae L",
          "Victorino C",
        ],
      },
      {
        2: [
          "Nguyen H",
          // Use commenting to omit an absent 
          // student ↓ from grouping and pairing:
          // "Eulalio T", 
          "Zülfiye Y",
          "Şuayip Y",
        ],
      },
    ],
  },
};
```

### Video tutorial:

[video]

## How did I build it?

Vibe coding with ChatGPT because I loathe trigonometry – but p5.js because I'm familiar with JS and the library.