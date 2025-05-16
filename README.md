# KquickMart - Online Grocery Store Application

KquickMart is a web application designed to simulate an online grocery shopping experience. Users can browse products, add items to a cart, manage their user accounts, place orders, and provide feedback on delivered orders. This project demonstrates full-stack capabilities with a React frontend and a Supabase (PostgreSQL) backend.

## Table of Contents

1.  [Features](#features)
2.  [Tech Stack](#tech-stack)
3.  [Database Schema](#database-schema)
    *   [Schema Diagram](#schema-diagram)
    *   [Table Descriptions](#table-descriptions)
4.  [Key Database Functions & Triggers](#key-database-functions--triggers)
    *   [`process_order1 (p_user_id uuid, p_cart_items json)`](#process_order1)
    *   [`get_user_orders (p_user_id uuid)`](#get_user_orders)
    *   [`handle_new_users ()` (Trigger Function)](#handle_new_users)
    *   [`trg_reduce_stock` (Trigger on `hasorderitems`)](#trg_reduce_stock)
    *   [`reduce_stock ()` (Trigger Function)](#reduce_stock)
5.  [Application Structure (Frontend)](#application-structure-frontend)
    *   [Core Components](#core-components)
    *   [State Management](#state-management)
    *   [Key Workflows](#key-workflows)
6.  [Setup and Installation](#setup-and-installation)
    *   [Prerequisites](#prerequisites)
    *   [Supabase Setup](#supabase-setup)
    *   [Frontend Setup](#frontend-setup)
7.  [Usage](#usage)
8.  [Troubleshooting & Key Learnings](#troubleshooting--key-learnings)
9.  [Future Enhancements](#future-enhancements)

## Features

*   **User Authentication:** Sign up, login, logout functionality.
*   **Product Browsing:** View products, filter by category, search products.
*   **Shopping Cart:** Add items to cart, update quantities, remove items, view cart total.
*   **Order Placement:** Proceed to checkout (summary), place orders.
*   **Order History:** View past orders with status, items, and totals.
*   **Stock Management:** Product quantities are checked before order placement and updated after.
*   **Order Feedback:** Users can provide a rating and comment for delivered orders.
*   **User Profiles:** Automatic creation of a public user profile linked to auth.

## Tech Stack

*   **Frontend:** React, Vite, Tailwind CSS, Lucide React (icons)
*   **Backend:** Supabase
    *   **Database:** PostgreSQL
    *   **Authentication:** Supabase Auth
    *   **Storage:** (Not explicitly used in current scope, but available for images)
    *   **Database Functions (RPC):** PL/pgSQL, SQL
    *   **Database Triggers**

## Database Schema

### Schema Diagram

*(You should insert the image of your schema diagram here. If you can't embed directly, provide a link or describe it)*
Example: `![Schema Diagram](./path/to/your/schema_diagram.png)`

### Table Descriptions

*   **`auth.users`**: (Supabase managed) Stores core authentication information (id, email, password hash, etc.).
*   **`public.users`**: Stores public user profile information.
    *   `id` (uuid, PK, FK to `auth.users.id`): User's unique identifier.
    *   `name` (varchar): User's display name.
    *   *(Other profile fields like avatar_url could be added here)*
*   **`public.categories`**: Stores product categories.
    *   `category_id` (int4, PK): Unique ID for the category.
    *   `category_name` (varchar): Name of the category (e.g., "Frozen Food", "Snacks").
*   **`public.products`**: Stores product information.
    *   `product_id` (int4, PK): Unique ID for the product.
    *   `product_name` (varchar): Name of the product.
    *   `price` (numeric): Current price of the product.
    *   `quantity` (int4): Current stock quantity available.
    *   `category_id` (int4, FK to `categories.category_id`): Category the product belongs to.
    *   `image_url` (text, nullable): URL for the product image.
*   **`public.cart`**: Represents a user's shopping cart.
    *   `cart_id` (int4, PK): Unique ID for the cart.
    *   `user_id` (uuid, FK to `auth.users.id`): The user who owns the cart.
*   **`public.cart_items`**: Stores items within a user's shopping cart.
    *   `cart_id` (int4, FK to `cart.cart_id`): Links to the cart.
    *   `product_id` (int4, FK to `products.product_id`): The product in the cart.
    *   `quantity` (int4): Quantity of the product in the cart.
    *   *(Consider adding `price_at_addition` numeric here if you want to lock in price when added to cart)*
*   **`public.orders`**: Stores placed orders.
    *   `order_id` (int4, PK): Unique ID for the order.
    *   `user_id` (uuid, FK to `auth.users.id`): The user who placed the order.
    *   `cart_id` (int4, nullable, FK to `cart.cart_id`): The cart from which the order was placed (optional, for history).
    *   `total_price` (numeric): Total price of the order.
    *   `ordered_at` (timestamp with time zone, default `now()`): When the order was placed.
    *   `status` (varchar): Order status (e.g., "Processing", "Delivered", "Cancelled").
*   **`public.hasorderitems`**: Stores line items for each order (junction table).
    *   `order_id` (int4, FK to `orders.order_id`): Links to the order.
    *   `product_id` (int4, FK to `products.product_id`): The product ordered.
    *   `quantity` (int4): Quantity of the product ordered.
    *   `price` (numeric): Price of the product *at the time of order placement*.
*   **`public.givesfeedback`**: Stores user feedback for orders.
    *   `feedback_id` (int4, PK): Unique ID for the feedback.
    *   `order_id` (int4, FK to `orders.order_id`): The order being reviewed.
    *   `user_id` (uuid, FK to `public.users.id`): The user who gave the feedback.
    *   `rating` (int4): Star rating (e.g., 1-5).
    *   `comment` (text, nullable): Textual feedback.

## Key Database Functions & Triggers

### `process_order1 (p_user_id uuid, p_cart_items json)`
*   **Purpose:** Handles the entire order placement logic.
*   **Security:** `INVOKER`
*   **Actions:**
    1.  Validates input cart items (non-empty, positive quantities, non-negative prices).
    2.  Calculates total order price.
    3.  Checks product stock availability for all items. Raises an `INSUFFICIENT_STOCK` or `PRODUCT_NOT_FOUND` exception if issues occur.
    4.  Inserts a new record into `public.orders` with an initial status (e.g., "Delivered" in the current simplified version).
    5.  Inserts each cart item into `public.hasorderitems`, storing the quantity and price at the time of order.
    6.  Clears the user's items from `public.cart_items` and updates `public.orders` with the `cart_id`.
    7.  Returns the `new_order_id`.
*   **Note:** Stock reduction is handled by the `trg_reduce_stock` trigger.

### `get_user_orders (p_user_id uuid)`
*   **Purpose:** Fetches a user's order history, including order items and feedback.
*   **Security:** `INVOKER`
*   **Language:** `plpgsql`
*   **Returns:** `TABLE(order_id integer, ordered_at timestamptz, total_price numeric, status varchar, order_items jsonb, feedback_details jsonb)`
*   **Actions:**
    1.  Selects orders for the given `p_user_id`.
    2.  Uses `jsonb_agg` and `jsonb_build_object` to aggregate related `hasorderitems` (joined with `products` for name/image) into an `order_items` JSONB array.
    3.  Uses `jsonb_agg` and `jsonb_build_object` to aggregate related `givesfeedback` into a `feedback_details` JSONB array.

### `handle_new_users ()` (Trigger Function)
*   **Purpose:** Automatically creates a profile in `public.users` when a new user signs up in `auth.users`.
*   **Security:** `DEFINER`
*   **Language:** `plpgsql`
*   **Returns:** `TRIGGER`
*   **Actions:**
    1.  Inserts a new row into `public.users` using the `id` and `email` from the `NEW` record (the newly created `auth.users` row).
    2.  Derives a default `name` from `NEW.raw_user_meta_data->>'full_name'`, `NEW.raw_user_meta_data->>'user_name'`, or `NEW.email`.

### `trg_reduce_stock` (Trigger on `hasorderitems`)
*   **Purpose:** Calls the `reduce_stock()` function after an item is inserted into `hasorderitems`.
*   **Event:** `AFTER INSERT ON public.hasorderitems`
*   **Orientation:** `FOR EACH ROW`

### `reduce_stock ()` (Trigger Function)
*   **Purpose:** Decrements the stock quantity in the `public.products` table.
*   **Security:** `INVOKER` (Consider changing to `DEFINER` for robustness if `authenticated` role lacks direct update rights on `products.quantity`).
*   **Language:** `plpgsql`
*   **Returns:** `TRIGGER`
*   **Actions:**
    1.  `UPDATE public.products SET quantity = quantity - NEW.quantity WHERE product_id = NEW.product_id;` (where `NEW` refers to the row just inserted into `hasorderitems`).

## Application Structure (Frontend)

### Core Components
*   **`App.jsx`**: Main application component, handles routing (tabs), global state (user, cart, products, categories), primary data fetching, and auth listeners.
*   **`OrderHistory.jsx`**: Displays the user's order history, fetches order details (including items and feedback via RPC), and handles feedback submission.
*   *(Other UI components for header, navigation, product display, cart sidebar, auth modals, checkout summary, etc.)*

### State Management
*   Primarily uses React's `useState` and `useCallback` hooks within `App.jsx` for global state.
*   `productsRef` is used in `App.jsx` to provide a stable reference to product data for `fetchUserCart` without causing excessive re-runs of `useCallback`.
*   Child components like `OrderHistory` manage their own local state (e.g., `isLoading`, `error`, `orders` list).

### Key Workflows
*   **Initial Load:** `App.jsx` sequentially fetches app data (products, categories) and then initializes authentication (session check, listeners). This sequence was critical to resolve initial loading hangs.
*   **Cart Management:** Cart operations optimistically update UI state, then sync with the Supabase backend (`cart` and `cart_items` tables).
*   **Order Placement:** `handlePlaceOrder` calls the `process_order1` RPC.
*   **Order History Viewing:** `OrderHistory` component calls the `get_user_orders` RPC when active.
*   **Feedback Submission:** `OrderHistory` handles UI for feedback and makes direct `INSERT` or `UPDATE` calls to the `givesfeedback` table.

## Setup and Installation

### Prerequisites
*   Node.js (e.g., v18.x or later)
*   npm or yarn
*   A Supabase account and project.

### Supabase Setup
1.  **Create a Supabase Project.**
2.  **Database Schema:**
    *   Use the Supabase Table Editor or SQL Editor to create the tables described in the [Database Schema](#database-schema) section.
    *   Ensure all Primary Keys, Foreign Keys, and appropriate data types are set.
    *   Pay special attention to `user_id` columns referencing `auth.users.id` or `public.users.id` as appropriate.
3.  **Database Functions & Triggers:**
    *   In the Supabase SQL Editor, create the PostgreSQL functions:
        *   `process_order1(p_user_id uuid, p_cart_items json)`
        *   `get_user_orders(p_user_id uuid)` (the version that returns items and feedback)
        *   `handle_new_users()`
        *   `reduce_stock()`
    *   Create the database triggers:
        *   `on_auth_user_created_populate_public_users` on `auth.users` calling `handle_new_users`.
        *   `trg_reduce_stock` on `hasorderitems` calling `reduce_stock`.
4.  **RLS Policies & Grants:**
    *   Disable RLS for `SELECT` on `products` and `categories` for the `anon` and `authenticated` roles if public browsing is desired.
    *   Ensure the `authenticated` role has `EXECUTE` permission on `process_order1` and `get_user_orders`.
        ```sql
        GRANT EXECUTE ON FUNCTION public.process_order1(uuid, json) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.get_user_orders(uuid) TO authenticated;
        ```
    *   If `reduce_stock` is `SECURITY INVOKER`, ensure `authenticated` has `UPDATE (quantity)` on `public.products`. It's recommended to make `reduce_stock` and `handle_new_users` `SECURITY DEFINER`.
    *   Set up RLS for `INSERT`/`UPDATE`/`SELECT` on `givesfeedback` to allow users to manage their own feedback.
    *   Ensure `public.users` can be written to by the `handle_new_users` (which is `SECURITY DEFINER`).
5.  **API Keys:**
    *   In your Supabase project: Project Settings -> API.
    *   Copy the **Project URL** and the **`anon` public key**.

### Frontend Setup
1.  Clone the repository:
    ```bash
    git clone <your-repo-url>
    cd kquickmart 
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```
3.  Configure Supabase credentials:
    *   In `src/App.jsx` (or a dedicated config file), update the `supabaseUrl` and `supabaseAnonKey` constants with your project's values:
        ```javascript
        const supabaseUrl = 'YOUR_SUPABASE_URL';
        const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
        ```
4.  Run the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
5.  Open your browser to `http://localhost:5173` (or the port Vite uses).

## Usage
1.  Sign up for a new account or log in.
2.  Browse products by category or search.
3.  Add items to your cart.
4.  View your cart and proceed to checkout.
5.  Place an order.
6.  (Manually update an order's status to "Delivered" in the Supabase table editor for testing feedback).
7.  Navigate to the "Orders" tab to view your order history.
8.  Submit feedback for a delivered order.

## Troubleshooting & Key Learnings
*   **Infinite Loading/Hangs:** Initial development faced issues with Supabase client queries hanging, especially in the Vite dev server with React Strict Mode. This was resolved by:
    *   Strictly sequencing initial data fetches (`fetchAppData`) to complete *before* initializing Supabase auth listeners and session checks in `App.jsx`.
    *   Simplifying complex Supabase queries (removing nested joins for client-side fetching initially, then re-introducing them via more robust RPC calls or carefully managed component fetches).
    *   Careful management of `useEffect` dependencies to prevent infinite loops or excessive re-fetches (e.g., using stable `useCallback` references, `useRef` for values that shouldn't trigger re-runs, and being specific with dependency arrays).
*   **SQL Syntax Errors:** Debugging PL/pgSQL syntax, especially block structure (`DECLARE`, `BEGIN`, `EXCEPTION`, `END`, `$$` delimiters), required careful attention. Using the Supabase UI for function creation/editing often expects only the function *body* without the `CREATE FUNCTION...AS $$` wrapper.
*   **Database Permissions (403 Forbidden on RPC):**
    *   Ensured the `authenticated` role has `EXECUTE` permission on RPC functions.
    *   For `SECURITY INVOKER` functions, verified that the `authenticated` role has the necessary table-level SQL privileges (`SELECT`, `INSERT`, `UPDATE`) on tables accessed by the function (this was relevant when RLS was initially thought to be the issue, but the root was missing `GRANT`s or incorrect table access like `auth.users`).
*   **Foreign Key Violations:** Resolved by ensuring that related records exist before an insert (e.g., populating `public.users` from `auth.users` via a trigger before `givesfeedback` tries to reference `public.users.id`).
*   **Schema Mismatches:** Errors like "column X does not exist" were fixed by aligning client-side Supabase queries (`.select(...)`) with the actual database table schemas.

## Future Enhancements
*   Implement proper discount logic and display.
*   Add more detailed product pages.
*   User profile management (update name, etc.).
*   Address and payment method management.
*   Real-time stock updates (e.g., using Supabase Realtime).
*   Admin panel for managing products, orders, and users.
*   More sophisticated error handling and user feedback in the UI.
*   Unit and integration tests.
*   Deployment to a hosting platform.
