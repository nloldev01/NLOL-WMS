# Frontend

This is the React frontend for NLOL WMS, using Tailwind CSS for styling.

## Setup

1. Install dependencies: `npm install`
2. Run development server: `npm run dev`
3. Build for production: `npm run build`

## Structure

- `src/App.jsx`: Main app component
- `src/main.jsx`: Entry point
- `src/index.css`: Global styles with Tailwind directives

## Styling

This project uses Tailwind CSS for utility-first styling. Add classes directly to your JSX elements for rapid UI development.

For complex features, add components in `src/components/`, pages in `src/pages/`, etc.

To integrate with Django, build the app and serve the `dist/` from Django static files.