<div id="top"></div>

<div align="center">

# 🧬 Interface Lab ⚛️

[![CI](https://github.com/AddysEdge/interface-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/AddysEdge/interface-lab/actions/workflows/ci.yml)

### A community-driven platform for discovering, building, and sharing reusable UI components.

Built for developers who want to find reusable UI patterns, preview them live, copy the source code, or publish their own components.


</div>

---

## Overview

**Development prototype.** CI checks linting and production compilation with dummy
credentials. Live sign-in, publishing and authorization need your own services and
database policies; see [setup and verification](docs/SETUP.md). A database migration
and RLS policy set are not yet included.

Interface Lab is a full-stack UI component-sharing platform where developers can discover and publish reusable frontend components built with **HTML, CSS, JavaScript, and Tailwind CSS**.

Instead of rebuilding common interface elements from scratch, developers can browse community-created components, preview them live, copy their source code, and integrate them into their own projects.

Interface Lab also provides a complete creator workflow with authentication, profiles, component publishing, likes, comments, filtering, and live code previews.

---

## ✨ Key Features

* **Component Library** — Browse reusable buttons, cards, forms, sections, and other UI patterns.
* **Live Preview** — View components rendered directly in the browser before using them.
* **Code Copying** — Copy HTML, CSS, and JavaScript source code directly from a component page.
* **Component Creator** — Build components using an integrated editor with real-time preview.
* **Search & Filtering** — Search by keyword and filter components by styling approach.
* **Sorting** — Discover components by popularity or recency.
* **Authentication** — Sign in to publish and interact with community content.
* **User Profiles** — View components created and liked by each user.
* **Likes & Comments** — Interact with components through likes, comments, and threaded replies.
* **Creator Attribution** — Link components back to their original design inspiration.
* **Light & Dark Mode** — Full theme support throughout the application.

---

## 🧠 How It Works

### 1. Discover

Users can browse the component library and search for UI elements that fit their project.

### 2. Preview

Every component can be rendered directly in the application so developers can inspect its appearance and behavior before using it.

### 3. Copy

Developers can access the component's HTML, CSS, and JavaScript and reuse it in their own applications.

### 4. Create

Authenticated users can build components through the built-in editor and preview their changes in real time.

### 5. Publish

Completed components can be submitted to the platform and made available to the rest of the community.

### 6. Interact

Users can like components, leave comments, reply to discussions, and build a profile around their contributions.

---

## 🛠️ Technical Highlights

* Built a reusable **component discovery and publishing workflow**.
* Implemented **live component rendering** so users can preview frontend code directly inside the application.
* Developed a **browser-based code editor** for creating and testing components.
* Implemented **search, filtering, and sorting** for component discovery.
* Built **authentication and user profile functionality**.
* Added **likes, comments, and nested replies** to support community interaction.
* Designed support for both **Tailwind CSS and traditional CSS components**.
* Implemented **light and dark themes** across the application.
* Created a responsive interface for browsing and viewing reusable UI components.

---

## 🧩 Component Model

Interface Lab organizes reusable UI into two main categories:

### Atoms

Small, reusable interface elements such as:

* Buttons
* Inputs
* Badges
* Loaders
* Icons

### Molecules

Larger UI patterns composed of multiple elements, such as:

* Forms
* Navigation sections
* Cards
* Hero sections
* Content blocks

This structure makes it easier to browse components based on their complexity and intended use.

---

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/AddysEdge/interface-lab.git
cd interface-lab
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure your services

Copy `.env.example` to the gitignored `.env.local` and add your own Clerk and
Supabase configuration. The [setup guide](docs/SETUP.md) explains the remaining
database and authorization prerequisites.

Required values:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_KEY=
```

For component screenshots hosted on your own storage, also set `COMPONENT_IMAGE_HOST`
to the HTTPS hostname only (without `https://` or a path). Clerk avatars are allowed
by default.

### 4. Start the development server

```bash
npm run dev
```

Open the local development URL shown in your terminal.

---

## 💡 Engineering Challenges

### Live Code Rendering

One of the main technical challenges was allowing user-provided frontend code to be previewed dynamically while maintaining a usable development experience.

The preview system needed to update as users edited their components and correctly render HTML, CSS, and JavaScript together.

### Component Discovery

As the component library grows, users need an efficient way to find useful UI elements.

Search, filtering, and sorting were added to make the library easier to navigate based on keywords, styling approach, popularity, and recency.

### Community Features

Interface Lab goes beyond simply displaying code snippets.

Supporting user-generated content required designing workflows for:

* Authentication
* Publishing
* Profiles
* Likes
* Comments
* Replies
* Attribution

### Responsive UI

Because the application itself is focused on frontend development, maintaining a polished and responsive interface across different screen sizes was an important part of the project.

---

## 🚀 Future Improvements

* Add more advanced component categories and tags
* Improve component search and ranking
* Add component collections and bookmarks
* Support additional frontend frameworks
* Add stronger validation for submitted code
* Improve preview isolation and sandboxing
* Add automated component moderation
* Add versioning for published components
* Improve accessibility metadata
* Add automated testing for user-submitted components
* Expand creator analytics and profile statistics

---

## 📜 License

Distributed under the **Apache License 2.0**.

See [`LICENSE`](./LICENSE) for details.

---

<div align="center">

### Build once. Share everywhere.

**[Explore Interface Lab](https://github.com/AddysEdge/interface-lab)**

</div>

<p align="right">
  <a href="#top">⬆️ Back to top</a>
</p>
