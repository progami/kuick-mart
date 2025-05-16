import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, Search, User, Home, Tag, ArrowRight, X, Plus, Minus, Heart, TrendingUp, Truck, Loader2, Package, ListOrdered, ImageOff
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import OrderHistory from './OrderHistory';

// --- Configuration ---
const supabaseUrl = 'https://ghekywzdxzyipibwjcon.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZWt5d3pkeHp5aXBpYndqY29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5MDg5NzYsImV4cCI6MjA2MjQ4NDk3Nn0.udK9ijO9CYL1dJiDGqQa1djx9I7QpqmQHodKIBGdP70';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const categoryColorMap = {
  'frozen food': 'bg-cyan-50', snacks: 'bg-yellow-50', electronics: 'bg-gray-100',
  beverages: 'bg-red-50', stationery: 'bg-purple-50', fruits: 'bg-red-50',
  vegetables: 'bg-green-50', dairy: 'bg-blue-50', bakery: 'bg-orange-50',
  meat: 'bg-pink-50', grains: 'bg-stone-50', default: 'bg-slate-50'
};

const generateColorFromCategory = (categoryName) => {
  const lowerCaseCategory = categoryName?.toLowerCase() || '';
  return categoryColorMap[lowerCaseCategory] || categoryColorMap.default;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCheckoutVisible, setIsCheckoutVisible] = useState(false);

  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');

  const productsRef = useRef([]);
  const [products, setProductsState] = useState([]); // Renamed to avoid conflict
  const [categories, setCategories] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [fetchDataError, setFetchDataError] = useState(null);

  const [cart, setCart] = useState([]);
  const [dbCartId, setDbCartId] = useState(null);
  const [isCartSyncing, setIsCartSyncing] = useState(false);

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderPlacementError, setOrderPlacementError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const fetchAppData = useCallback(async () => {
    console.log("[App Data] Initiating data fetch (Products no-join, then Categories)...");
    setFetchDataError(null);
    let productsDataResult = [];
    let categoriesDataResult = [];
    let productsErrorResult = null;
    let categoriesErrorResult = null;

    console.log("[App Data] Attempting Products (simple select)...");
    try {
        const { data, error } = await supabase
            .from('products')
            .select('product_id, product_name, price, quantity, category_id, image_url'); // No discountedPrice
        if (error) { productsErrorResult = error; console.error("[App Data] Error Products:", error); }
        else { productsDataResult = data || []; console.log("[App Data] Success Products. Count:", productsDataResult.length); }
    } catch (e) { productsErrorResult = e; console.error("[App Data] CATCH Products:", e); }

    console.log("[App Data] Attempting Categories fetch...");
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('category_id, category_name')
            .order('category_name');
        if (error) { categoriesErrorResult = error; console.error("[App Data] Error Categories:", error); }
        else { categoriesDataResult = data || []; console.log("[App Data] Success Categories. Count:", categoriesDataResult.length); }
    } catch (e) { categoriesErrorResult = e; console.error("[App Data] CATCH Categories:", e); }
    
    return { productsData: productsDataResult, categoriesData: categoriesDataResult, productsError: productsErrorResult, categoriesError: categoriesErrorResult };
  }, []);

  const fetchUserCart = useCallback(async (userIdToFetch) => {
    const currentProducts = productsRef.current; 
    if (!userIdToFetch) { setCart([]); setDbCartId(null); return; }
    if (!currentProducts || currentProducts.length === 0) {
      console.warn("[Cart Fetch] Aborted: products data (from ref) not yet available for mapping.");
      return; 
    }
    console.log(`[Cart Fetch DEBUG] START - User: ${userIdToFetch}. Mapping with ${currentProducts.length} products.`);
    try {
      const { data, error } = await supabase
        .from('cart')
        .select('cart_id, cart_items ( product_id, quantity )') // Select only product_id, quantity from cart_items
        .eq('user_id', userIdToFetch)
        .maybeSingle();

      if (error) throw error;

      if (data && data.cart_items) {
        setDbCartId(data.cart_id);
        const newCart = data.cart_items.map(cartItem => {
          const productDetails = currentProducts.find(p => p.id === cartItem.product_id);
          if (productDetails) {
            return {
              ...productDetails, // This includes name, image_url, category, color, and importantly price (which becomes discountedPrice)
              quantity: cartItem.quantity,
              // discountedPrice will be productDetails.price (or productDetails.discountedPrice if that was set from productDetails.price)
            };
          }
          return null;
        }).filter(Boolean);
        setCart(newCart);
      } else {
        setCart([]); setDbCartId(null);
      }
    } catch (error) {
      console.error(`[Cart Fetch] CATCH - User ${userIdToFetch}:`, error.message);
      setCart([]); setDbCartId(null);
    }
  }, [setCart, setDbCartId]);

  useEffect(() => {
    let isMounted = true;
    let authListenerSubscription = null;
    const delayMs = 100; 

    async function initializeAppAndAuth() {
      if(isMounted) setIsLoadingData(true);
      const appDataResult = await fetchAppData();

      if (!isMounted) return;

      let processedProducts = [];
      if (appDataResult.categoriesError) { setCategories([]); }
      else { setCategories((appDataResult.categoriesData || []).map(c => ({ id: c.category_id, name: c.category_name, icon: '🏷️', color: generateColorFromCategory(c.category_name) }))); }
      
      if (appDataResult.productsError) { productsRef.current = []; setProductsState([]); }
      else {
          const categoryMap = (appDataResult.categoriesData || []).reduce((acc, cat) => { acc[cat.category_id] = cat.category_name; return acc; }, {});
          processedProducts = (appDataResult.productsData || []).map(p => {
              const categoryName = p.category_id ? categoryMap[p.category_id] : null;
              return {
                  id: p.product_id, name: p.product_name, category: (categoryName || 'uncategorized').toLowerCase(),
                  price: p.price || 0, discountedPrice: p.price || 0, // Set discountedPrice from price
                  discountPercentage: 0, quantity: p.quantity ?? 0, image_url: p.image_url || null, 
                  unit: 'item', icon: '❓', featured: false, color: generateColorFromCategory(categoryName),
              };
          });
          productsRef.current = processedProducts;
          setProductsState(processedProducts);
      }
      if (appDataResult.productsError || appDataResult.categoriesError) {
          let combinedErrorMessages = [];
          if (appDataResult.categoriesError) combinedErrorMessages.push(`Categories: ${appDataResult.categoriesError.message}`);
          if (appDataResult.productsError) combinedErrorMessages.push(`Products: ${appDataResult.productsError.message}`);
          if(isMounted) setFetchDataError(combinedErrorMessages.join('; ') || "An unknown error occurred.");
      } else {
          if(isMounted) setFetchDataError(null);
      }

      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        const newSessionUser = session?.user ?? null;
        setUser(newSessionUser);
        setTimeout(async () => {
            if (!isMounted || !newSessionUser) return;
            if (event === 'SIGNED_IN') { setIsAuthModalOpen(false); await fetchUserCart(newSessionUser.id); }
            else if (event === 'SIGNED_OUT') { setCart([]); setDbCartId(null); setIsProfileOpen(false); }
            else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { await fetchUserCart(newSessionUser.id); }
        }, delayMs);
      });
      authListenerSubscription = listener;

      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (sessionError) { console.error("[Auth Init] getSession error:", sessionError); }
        else {
          const initialUser = currentSession?.user ?? null;
          setUser(initialUser);
          if (initialUser) {
            setTimeout(async () => {
                if (!isMounted || !initialUser) return;
                await fetchUserCart(initialUser.id);
            }, delayMs);
          }
        }
      } catch (err) {
        if (isMounted) console.error("[Auth Init] getSession CATCH:", err);
      } finally {
        if(isMounted) setIsLoadingData(false);
      }
    }
    initializeAppAndAuth();
    return () => {
      isMounted = false;
      if (authListenerSubscription) authListenerSubscription.subscription?.unsubscribe();
    };
  }, [fetchAppData, fetchUserCart]);

  const syncCartItemWithDb = useCallback(async (productId, quantity, cartIdForSync) => {
    const currentUser = user; 
    if (!currentUser || !cartIdForSync) return false;
    setIsCartSyncing(true);
    try {
      const op = quantity > 0 ?
        supabase.from('cart_items').upsert({ cart_id: cartIdForSync, product_id: productId, quantity }, { onConflict: 'cart_id, product_id' }) :
        supabase.from('cart_items').delete().eq('cart_id', cartIdForSync).eq('product_id', productId);
      const { error } = await op;
      if (error) throw error;
      return true;
    } catch (error) { alert("Error updating cart in DB."); return false; }
    finally { setIsCartSyncing(false); }
  }, [user]); 

  const addToCart = useCallback(async (product) => {
    // ... (addToCart logic remains the same as previous full code)
    if (!product || !product.id || isCartSyncing) return;
    const originalCart = JSON.parse(JSON.stringify(cart));
    const existingItem = cart.find(item => item.id === product.id);
    const quantityToSet = existingItem ? existingItem.quantity + 1 : 1;

    setCart(prevCart => 
      existingItem 
        ? prevCart.map(item => item.id === product.id ? { ...item, quantity: quantityToSet } : item)
        : [...prevCart, { ...product, quantity: quantityToSet }]
    );

    if (user) {
        let cartIdToUse = dbCartId;
        if (!cartIdToUse) {
            setIsCartSyncing(true); 
            try {
                const { data: newCartData, error } = await supabase.from('cart').insert({ user_id: user.id }).select('cart_id').single();
                if (error || !newCartData?.cart_id) throw error || new Error("New cart ID missing.");
                cartIdToUse = newCartData.cart_id;
                setDbCartId(cartIdToUse);
            } catch (error) {
                setCart(originalCart); setIsCartSyncing(false); return;
            }
        }
        if (!cartIdToUse) { setCart(originalCart); if(isCartSyncing) setIsCartSyncing(false); return; }

        const syncSuccess = await syncCartItemWithDb(product.id, quantityToSet, cartIdToUse);
        if (!syncSuccess) setCart(originalCart);
    }
  }, [user, dbCartId, cart, isCartSyncing, setCart, setDbCartId, syncCartItemWithDb]);

  const removeFromCart = useCallback(async (productId) => {
    // ... (removeFromCart logic remains the same)
    if (isCartSyncing) return;
    const originalCart = JSON.parse(JSON.stringify(cart));
    const itemInCart = cart.find(item => item.id === productId);
    if (!itemInCart) return;

    const quantityToSet = itemInCart.quantity - 1;
    if (quantityToSet > 0) {
        setCart(prevCart => prevCart.map(item => item.id === productId ? { ...item, quantity: quantityToSet } : item));
    } else {
        setCart(prevCart => prevCart.filter(item => item.id !== productId));
    }

    if (user && dbCartId) {
        const syncSuccess = await syncCartItemWithDb(productId, quantityToSet, dbCartId);
        if (!syncSuccess) setCart(originalCart);
    }
  }, [user, dbCartId, cart, isCartSyncing, setCart, syncCartItemWithDb]);

  const deleteFromCart = useCallback(async (productId) => {
    // ... (deleteFromCart logic remains the same)
    if (isCartSyncing) return;
    const originalCart = JSON.parse(JSON.stringify(cart));
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
    if (user && dbCartId) {
        const syncSuccess = await syncCartItemWithDb(productId, 0, dbCartId);
        if (!syncSuccess) setCart(originalCart);
    }
  }, [user, dbCartId, cart, isCartSyncing, setCart, syncCartItemWithDb]);

  const handleAuthFormSubmit = async (e) => { /* ... same ... */ 
    e.preventDefault(); if (isAuthLoading) return;
    const handler = authMode === 'signup' ? handleSignUp : handleSignIn;
    if (authMode === 'signup' && (authPassword.length < 6 || authPassword !== authConfirmPassword)) {
        alert(authPassword.length < 6 ? "Password min 6 chars." : "Passwords don't match."); return;
    }
    await handler(authEmail, authPassword);
  };
  const handleSignIn = async (email, password) => { /* ... same ... */ 
    setIsAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(`Login Failed: ${error.message}`);
    } catch (error) { console.error("[Auth] Sign in error:", error.message);
    } finally { setIsAuthLoading(false); }
  };
  const handleSignUp = async (email, password) => { /* ... same ... */ 
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) alert(`Sign Up Failed: ${error.message}`);
      else alert(data?.user?.identities?.length === 0 ? 'Sign up successful!' : 'Sign up successful! Check email for confirmation.');
    } catch (error) { console.error("[Auth] Sign up error:", error.message);
    } finally { setIsAuthLoading(false); }
  };
  const handleSignOut = async () => { /* ... same ... */ 
    setIsAuthLoading(true);
    try {
      await supabase.auth.signOut(); setActiveTab('home'); 
    } catch (error) { alert(`Sign Out Error: ${error.message}`);
    } finally { setIsAuthLoading(false); }
  };
  const handleProceedToCheckout = () => { /* ... same ... */ 
    if (!user) { alert('Log in to proceed.'); setIsCartOpen(false); openAuthModal('login'); return; }
    if (cart.length === 0) { alert('Cart is empty.'); return; }
    setOrderPlacementError(null); setIsCartOpen(false); setIsCheckoutVisible(true);
  };
  const handlePlaceOrder = async () => {
    if (!user || !user.id || cart.length === 0) {
        if(!user) openAuthModal('login');
        if(cart.length === 0) setOrderPlacementError("Empty cart.");
        return;
    }
    setIsPlacingOrder(true); setOrderPlacementError(null);
    const itemsRPC = cart.map(i => ({ product_id: i.id, quantity: i.quantity, price: i.discountedPrice }));
    try {
      const { data: orderId, error } = await supabase.rpc('process_order1', { p_user_id: user.id, p_cart_items: itemsRPC });
      if (error) {
        throw new Error(error.message.includes('INSUFFICIENT_STOCK') ? `Order failed: Not enough stock.` : `Order failed: ${error.message}`);
      }
      setCart([]); setIsCheckoutVisible(false); alert(`Order placed! ID: ${orderId || 'N/A'}`);
      setActiveTab('orders');
      
      const appDataResult = await fetchAppData(); // Re-fetch data
      // No isMounted check needed here as it's an event handler
      if (appDataResult.productsData) {
          const categoryMap = (appDataResult.categoriesData || categories).reduce((acc, cat) => { acc[cat.category_id] = cat.category_name; return acc; }, {});
          const newProducts = (appDataResult.productsData || []).map(p => ({
              id: p.product_id, name: p.product_name, category: (categoryMap[p.category_id] || 'uncategorized').toLowerCase(),
              price: p.price || 0, discountedPrice: p.price || 0, discountPercentage: 0,
              quantity: p.quantity ?? 0, image_url: p.image_url || null, unit: 'item', icon: '❓', featured: false,
              color: generateColorFromCategory(categoryMap[p.category_id]),
          }));
          productsRef.current = newProducts;
          setProductsState(newProducts);
      }
      if(appDataResult.categoriesData) {
          setCategories((appDataResult.categoriesData || []).map(c => ({ id: c.category_id, name: c.category_name, icon: '🏷️', color: generateColorFromCategory(c.category_name) })));
      }

    } catch (error) {
      setOrderPlacementError(error.message);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const openAuthModal = (mode='login') => { setAuthMode(mode); setIsAuthModalOpen(true); };
  const totalCartAmount = cart.reduce((s, i) => s + (i.discountedPrice * i.quantity), 0);
  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) && (selectedCategory === 'all' || p.category === selectedCategory));

  if (isLoadingData && productsRef.current.length === 0 && categories.length === 0 && !fetchDataError) {
    return <div className="fixed inset-0 flex flex-col justify-center items-center bg-slate-100 z-[100]"><Loader2 className="animate-spin text-indigo-600" size={64} /><p className="mt-4 text-lg">Loading KquickMart...</p></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white py-4 px-4 sm:px-6 sticky top-0 z-30 shadow-xl">
        <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <div className="text-2xl font-bold flex items-center tracking-tight cursor-pointer" onClick={() => {setActiveTab('home'); setShowSearchBar(false);}}>
                <ShoppingCart className="inline mr-2.5 text-yellow-300" size={28} />
                <span className="text-white">K<span className="text-yellow-300">quick</span>Mart</span>
              </div>
              {showSearchBar ? (
                <div className="relative w-full sm:w-1/2 flex items-center">
                    <input type="text" placeholder="Search products..." className="w-full p-2.5 pl-10 rounded-lg text-gray-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus/>
                    <Search className="absolute left-3.5 top-3 text-gray-400 h-5 w-5" />
                    <button className="ml-2 p-2 rounded-full hover:bg-purple-600 transition-colors" onClick={() => {setShowSearchBar(false); setSearchQuery('');}} aria-label="Close search bar"><X size={22} /></button>
                </div>
              ) : (
                <button className="p-2.5 rounded-full hover:bg-purple-600 transition-colors" onClick={() => setShowSearchBar(true)} aria-label="Open search bar"><Search size={22} /></button>
              )}
              <div className="flex items-center space-x-3 sm:space-x-5">
                <button className="relative p-2.5 rounded-full hover:bg-purple-600 transition-colors" onClick={() => setIsCartOpen(!isCartOpen)} aria-label="Open shopping cart">
                    <ShoppingCart size={22} />
                    {totalCartItems > 0 && <span className="absolute -top-1 -right-1 bg-yellow-400 text-indigo-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-md">{totalCartItems}</span>}
                </button>
                <button className="p-1.5 rounded-full hover:bg-purple-600 transition-colors" onClick={() => user ? setIsProfileOpen(true) : openAuthModal('login')} aria-label={user ? "Open user profile" : "Open login"}>
                    {user ? <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-lg shadow-sm">{user.email?.charAt(0).toUpperCase() || 'U'}</div> : <User size={24} />}
                </button>
              </div>
            </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 sm:p-6 pb-24">
        {fetchDataError && !isLoadingData && activeTab !== 'orders' && !isPlacingOrder && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md mb-6" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline ml-1"> {fetchDataError}</span>
                <button onClick={async () => {
                    setIsLoadingData(true); 
                    const result = await fetchAppData();
                    // Process results like in useEffect
                    if(result.productsError || result.categoriesError) { 
                        let combinedErrorMessages = [];
                        if (result.categoriesError) combinedErrorMessages.push(`Categories: ${result.categoriesError.message}`);
                        if (result.productsError) combinedErrorMessages.push(`Products: ${result.productsError.message}`);
                        setFetchDataError(combinedErrorMessages.join('; ') || "An unknown error occurred.");
                        setProductsState([]); setCategories([]); productsRef.current = [];
                     } else { 
                        const categoryMap = (result.categoriesData || []).reduce((acc, cat) => { acc[cat.category_id] = cat.category_name; return acc; }, {});
                        const newProds = (result.productsData || []).map(p => ({
                            id: p.product_id, name: p.product_name, category: (categoryMap[p.category_id] || 'uncategorized').toLowerCase(),
                            price: p.price || 0, discountedPrice: p.price || 0, discountPercentage: 0,
                            quantity: p.quantity ?? 0, image_url: p.image_url || null, unit: 'item', icon: '❓', featured: false,
                            color: generateColorFromCategory(categoryMap[p.category_id]),
                        }));
                        productsRef.current = newProds;
                        setProductsState(newProds);
                        setCategories((result.categoriesData || []).map(c => ({ id: c.category_id, name: c.category_name, icon: '🏷️', color: generateColorFromCategory(c.category_name) })));
                        setFetchDataError(null);
                     }
                    setIsLoadingData(false);
                }} className="ml-4 mt-2 sm:mt-0 sm:ml-2 bg-red-200 text-red-800 px-3 py-1 rounded text-sm font-medium hover:bg-red-300 transition-colors">Try Again</button>
            </div>
        )}

        {activeTab === 'home' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gradient-to-br from-green-400 to-teal-500 rounded-xl p-6 flex justify-between items-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer" onClick={() => document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' })}>
                    <div className="text-white"><h2 className="text-2xl font-bold">Fresh Groceries</h2><p className="text-sm opacity-90">Delivered to your door</p><span className="inline-block mt-3 text-xs bg-white/25 px-3 py-1 rounded-full font-medium">Shop Now</span></div>
                    <div className="bg-white/20 rounded-lg shadow-md h-28 w-28 flex items-center justify-center"><span className="text-white text-5xl">🛒</span></div>
                </div>
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl p-6 flex justify-between items-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer" onClick={() => document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' })}>
                    <div className="text-white"><h2 className="text-2xl font-bold">Daily Deals</h2><p className="text-sm opacity-90">Save big every day</p><span className="inline-block mt-3 text-xs bg-white/25 px-3 py-1 rounded-full font-medium">View Offers</span></div>
                    <div className="bg-white/20 rounded-lg shadow-md h-28 w-28 flex items-center justify-center"><Tag size={50} className="text-white opacity-90" /></div>
                </div>
            </div>

            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-5">Shop by Category</h2>
              {isLoadingData && categories.length === 0 && !fetchDataError ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-indigo-500" size={40}/> <span className="ml-3 text-gray-600">Loading Categories...</span></div>
              ) : !isLoadingData && categories.length === 0 && fetchDataError && productsRef.current.length === 0 ? ( 
                <p className="text-base text-red-500">Could not load store categories. {fetchDataError && fetchDataError.includes("Categories:") ? fetchDataError : ""}</p>
              ) : !isLoadingData && categories.length === 0 && !fetchDataError ? (
                <p className="text-base text-gray-500">No categories available.</p>
              ) : (
                <div className="flex overflow-x-auto gap-4 pb-3 scrollbar-thin scrollbar-thumb-indigo-300 scrollbar-track-indigo-100">
                  <button
                    key="all-categories-btn"
                    className={`flex-shrink-0 flex flex-col items-center bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-200 w-28 h-36 justify-center text-center border-2 ${selectedCategory === 'all' ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-1' : 'border-transparent hover:border-indigo-300'}`}
                    onClick={() => { setSelectedCategory('all'); document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                  >
                    <div className={`w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-2.5 shadow-inner`}>
                      <ListOrdered size={28} className="text-indigo-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">All</span>
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id || cat.name}
                      className={`flex-shrink-0 flex flex-col items-center bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-200 w-28 h-36 justify-center text-center border-2 ${selectedCategory === cat.name.toLowerCase() ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-1' : 'border-transparent hover:border-indigo-300'}`}
                      onClick={() => { setSelectedCategory(cat.name.toLowerCase()); document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                    >
                      <div className={`w-16 h-16 rounded-full ${cat.color || 'bg-gray-100'} flex items-center justify-center mb-2.5 shadow-inner overflow-hidden`}>
                        <span className="text-3xl filter drop-shadow-sm">{cat.icon}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 whitespace-normal break-words leading-tight">
                        {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {!isLoadingData && products.filter(p => p.featured).length > 0 && (
              <div className="mb-10">
                <div className="flex items-center mb-5">
                  <TrendingUp size={24} className="text-indigo-600 mr-2.5" />
                  <h2 className="text-2xl font-bold text-gray-800">Hot Deals</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.filter(p => p.featured).slice(0, 4).map(product => (
                      <div key={product.id} className="bg-white rounded-xl shadow-lg overflow-hidden group transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                        <div className="relative h-56 w-full">
                            {product.image_url ? ( <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> ) : ( <div className={`w-full h-full ${product.color} flex items-center justify-center`}><ImageOff size={48} className="text-gray-400" /></div> )}
                            {product.discountPercentage > 0 && <span className="absolute top-3 left-3 bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">{product.discountPercentage}% OFF</span>}
                            {product.featured && <span className="absolute top-3 right-3 bg-yellow-400 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">HOT</span>}
                        </div>
                        <div className="p-5">
                            <h3 className="font-semibold text-lg text-gray-800 truncate mb-1" title={product.name}>{product.name}</h3>
                            <p className="text-sm text-gray-500 mb-3">{product.unit || 'item'}</p>
                            <div className="flex justify-between items-center">
                              <div>
                                  <span className="font-bold text-xl text-indigo-700">${product.discountedPrice.toFixed(2)}</span>
                                  {product.discountPercentage > 0 && <span className="text-sm text-gray-400 line-through ml-2">${product.price.toFixed(2)}</span>}
                              </div>
                              <button 
                                onClick={() => addToCart(product)} 
                                className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[70px] h-[38px]" 
                                disabled={product.quantity <= 0 || isCartSyncing } 
                                > 
                                {isCartSyncing && cart.find(ci => ci.id === product.id) ? <Loader2 className="animate-spin" size={18}/> : "ADD"} 
                              </button>
                            </div>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            )}

            <div id="products-section" className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 pt-6 border-t border-gray-200 mt-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">{selectedCategory === 'all' ? 'All Products' : `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}`}</h2>
                    {!isLoadingData && selectedCategory !== 'all' && products.length > 0 && <div className="mt-1 text-sm text-indigo-600">{filteredProducts.length} items found</div>}
                    {isLoadingData && products.length === 0 && !fetchDataError && <div className="mt-1 text-sm text-gray-500 flex items-center"><Loader2 className="animate-spin mr-2" size={18}/> Loading products...</div>}
                </div>
            </div>
            {isLoadingData && products.length === 0 && !fetchDataError ? ( 
                <div className="flex justify-center items-center h-80"><Loader2 className="animate-spin text-indigo-500" size={56} /> <span className="ml-4 text-xl text-gray-600">Loading Products...</span></div>
            ) : !isLoadingData && products.length === 0 && fetchDataError ? ( 
                <div className="col-span-full py-16 text-center">
                    <ImageOff size={72} className="text-gray-300 mx-auto mb-6" />
                    <h3 className="text-xl font-semibold text-red-600 mb-2">Failed to Load Products</h3>
                    <p className="text-gray-500 mb-6">{fetchDataError && fetchDataError.includes("Products:") ? fetchDataError : "There was an error fetching product data."}</p>
                    <button onClick={async () => { /* ... retry logic ... */ }} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg font-medium"> Try Again </button>
                </div>
            ) : !isLoadingData && filteredProducts.length === 0 && !fetchDataError ? ( 
                <div className="col-span-full py-16 text-center">
                    <ImageOff size={72} className="text-gray-300 mx-auto mb-6" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No products found</h3>
                    <p className="text-gray-500 mb-6">{searchQuery ? `We couldn't find any products matching "${searchQuery}".` : `There are no products in "${selectedCategory}". Try a different category or view all products.`}</p>
                    <button onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg font-medium"> View All Products </button>
                </div>
            ) : ( 
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-8">
                    {filteredProducts.map(product => (
                        <div key={product.id} className="bg-white rounded-xl shadow-lg overflow-hidden group transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1.5">
                          <div className="relative h-60 w-full">
                              {product.image_url ? ( <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> ) : ( <div className={`w-full h-full ${product.color} flex items-center justify-center`}><ImageOff size={48} className="text-gray-400" /></div> )}
                              <button className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-500 hover:text-red-500 hover:bg-white transition-all shadow-md"> <Heart size={18} /> </button>
                              {product.featured && <span className="absolute top-3 left-3 bg-yellow-400 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">DEAL</span>}
                          </div>
                          <div className="p-5">
                              <h3 className="font-semibold text-lg text-gray-800 truncate mb-1" title={product.name}>{product.name}</h3>
                              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5"> {product.category.charAt(0).toUpperCase() + product.category.slice(1)} </p>
                              <p className="text-sm text-gray-500 mb-3"> {product.quantity > 0 ? `In Stock: ${product.quantity}` : <span className='text-red-500 font-semibold'>Out of Stock</span>} </p>
                              <div className="flex justify-between items-center">
                                <div> <span className="font-bold text-xl text-indigo-700">${product.discountedPrice.toFixed(2)}</span> </div>
                                <button 
                                  onClick={() => addToCart(product)} 
                                  className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[70px] h-[38px]" 
                                  disabled={product.quantity <= 0 || isCartSyncing} 
                                > 
                                  {isCartSyncing && cart.find(ci => ci.id === product.id) ? <Loader2 className="animate-spin" size={18}/> : "ADD"}
                                </button>
                              </div>
                          </div>
                        </div>
                    ))}
                </div>
            )}
          </>
        )}
        <OrderHistory user={user} isActive={activeTab === 'orders'} supabaseClient={supabase} />
      </main>

      <nav className="bg-white border-t border-gray-200 fixed bottom-0 w-full shadow-top z-30">
        <div className="container mx-auto flex justify-around items-center py-2.5 sm:py-3">
            <button className={`flex flex-col items-center p-2 transition-colors ${activeTab === 'home' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-500'}`} onClick={() => setActiveTab('home')}><Home size={22} /> <span className={`text-xs mt-1 ${activeTab === 'home' ? 'font-semibold' : 'font-medium'}`}>Home</span></button>
            <button className={`flex flex-col items-center p-2 transition-colors ${activeTab === 'orders' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-500'}`} onClick={() => setActiveTab('orders')}><Truck size={22}/> <span className={`text-xs mt-1 ${activeTab === 'orders' ? 'font-semibold' : 'font-medium'}`}>Orders</span></button>
            <button className={`flex flex-col items-center p-2 transition-colors ${isProfileOpen ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-500'}`} onClick={() => user ? setIsProfileOpen(true) : openAuthModal('login')}><User size={22}/> <span className={`text-xs mt-1 ${isProfileOpen ? 'font-semibold' : 'font-medium'}`}>Account</span></button>
        </div>
      </nav>

      <div className={`fixed top-0 right-0 h-full w-full sm:w-4/5 md:w-1/2 lg:w-2/5 xl:max-w-md bg-white shadow-2xl transform ${isCartOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out z-40 flex flex-col`}>
        <div className="p-5 flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0 bg-slate-50 rounded-t-lg sm:rounded-t-none">
          <h2 className="text-xl font-semibold text-gray-800">Your Cart {isCartSyncing && <Loader2 className="inline animate-spin ml-2 text-indigo-500" size={18}/>}</h2>
          <button className="p-2 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors" onClick={() => setIsCartOpen(false)}><X size={22} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-gray-500 p-8 text-center">
              <ShoppingCart size={72} className="mb-6 opacity-30" />
              <p className="text-lg font-semibold mb-2">Your cart is empty</p>
              <p className="text-sm mb-6">Looks like you haven't added anything yet.</p>
              <button className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all" onClick={() => setIsCartOpen(false)}>Start Shopping</button>
          </div>
        ) : (
            <>
              <div className="flex-grow overflow-y-auto p-5 space-y-5">
                {cart.map(item => (
                    <div key={item.id} className="flex items-center p-4 border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow bg-white">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg mr-4 flex-shrink-0 overflow-hidden shadow-inner">
                          {item.image_url ? ( <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> ) : ( <div className={`w-full h-full ${item.color} flex items-center justify-center`}><ImageOff size={32} className="text-gray-400" /></div> )}
                      </div>
                      <div className="flex-grow">
                          <h3 className="font-semibold text-gray-800 text-base leading-tight mb-0.5">{item.name}</h3>
                          <p className="text-xs text-gray-500 mb-1.5">{item.unit || 'item'}</p>
                          <span className="font-bold text-indigo-700 text-md">${item.discountedPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col items-end ml-3 space-y-2">
                          <div className="flex items-center border border-gray-300 rounded-md overflow-hidden shadow-sm">
                              <button className="p-1.5 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50" onClick={() => removeFromCart(item.id)} aria-label={`Decrease quantity of ${item.name}`} disabled={isCartSyncing }><Minus size={16} /></button>
                              <span className="px-3 text-sm font-medium text-gray-700">{item.quantity}</span>
                              <button className="p-1.5 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50" onClick={() => addToCart(item)} aria-label={`Increase quantity of ${item.name}`} disabled={isCartSyncing }><Plus size={16} /></button>
                          </div>
                          <button className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50" onClick={() => deleteFromCart(item.id)} disabled={isCartSyncing }>Remove</button>
                      </div>
                    </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-5 p-5 bg-slate-50 rounded-b-lg sm:rounded-b-none mt-auto flex-shrink-0 shadow-top-strong">
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-gray-600"><span >Subtotal</span><span className="font-medium">${totalCartAmount.toFixed(2)}</span></div>
                    <div className="flex justify-between text-gray-600"><span >Delivery Fee</span><span className="font-medium">$4.99</span></div>
                </div>
                <div className="flex justify-between font-bold text-xl text-gray-800 mb-5 pt-3 border-t border-gray-300"><span >Total</span><span className="text-indigo-700">${(totalCartAmount + 4.99).toFixed(2)}</span></div>
                <button onClick={handleProceedToCheckout} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-base disabled:opacity-60" disabled={cart.length === 0 || isPlacingOrder || isCartSyncing } > Proceed to Checkout <ArrowRight size={20} className="ml-2.5" /> </button>
                <p className="text-xs text-gray-500 text-center mt-4 flex items-center justify-center"><Truck size={14} className="mr-1.5 opacity-70" /> Estimated delivery: 30-45 minutes</p>
              </div>
            </>
        )}
      </div>

      {(isCartOpen || isAuthModalOpen || isProfileOpen || isCheckoutVisible) && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30" onClick={() => { setIsCartOpen(false); setIsAuthModalOpen(false); setIsProfileOpen(false); if (!isPlacingOrder && !isCartSyncing) setIsCheckoutVisible(false); }}/>}

      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 pointer-events-none">
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 pointer-events-auto">
            <button onClick={() => setIsAuthModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50 p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close" disabled={isAuthLoading}><X size={24} /></button>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">{authMode === 'login' ? 'Welcome Back!' : 'Create Your Account'}</h2>
            <form onSubmit={handleAuthFormSubmit}>
                <div className="mb-4"><label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="auth-email">Email</label><input id="auth-email" type="email" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 text-base shadow-sm" placeholder="your@email.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete='email' disabled={isAuthLoading} /></div>
                <div className="mb-4"><label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="auth-password">Password</label><input id="auth-password" type="password" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 text-base shadow-sm" placeholder="•••••••• (min. 6)" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} disabled={isAuthLoading} /></div>
                {authMode === 'signup' && <div className="mb-6"><label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="auth-confirm-password">Confirm Password</label><input id="auth-confirm-password" type="password" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 text-base shadow-sm" placeholder="••••••••" value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} required autoComplete='new-password' disabled={isAuthLoading} /></div>}
                {authMode === 'login' && <div className="mb-6 text-right"><button type="button" className="text-sm text-indigo-600 hover:underline disabled:opacity-50" onClick={() => alert('Password reset functionality to be implemented.')} disabled={isAuthLoading}>Forgot Password?</button></div>}
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 flex justify-center items-center font-semibold disabled:opacity-75 text-base shadow-md hover:shadow-lg transition-all" disabled={isAuthLoading}>{isAuthLoading ? <Loader2 className="animate-spin" size={20} /> : (authMode === 'login' ? 'Login' : 'Sign Up')}</button>
            </form>
            <div className="mt-6 text-center"><p className="text-sm text-gray-600">{authMode === 'login' ? "Don't have an account?" : "Already have an account?"}<button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthEmail(''); setAuthPassword(''); setAuthConfirmPassword(''); }} className="ml-1 font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-75" disabled={isAuthLoading}>{authMode === 'login' ? 'Sign up' : 'Login'}</button></p></div>
          </div>
        </div>
      )}

      {isProfileOpen && user && (
          <div className="fixed inset-0 z-50 flex justify-center items-center p-4 pointer-events-none">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative pointer-events-auto">
                <button onClick={() => setIsProfileOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50 p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close Profile" disabled={isAuthLoading}><X size={24} /></button>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">Your Profile</h2>
                  <div className="mb-6 sm:mb-8">
                      <div className="flex items-center justify-center mb-4">
                          <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center shadow-md"><span className="text-4xl font-semibold text-indigo-700">{user.email?.charAt(0).toUpperCase() || 'U'}</span></div>
                      </div>
                      <div className="text-center"><h3 className="text-lg font-medium break-all text-gray-700">{user.email || 'User'}</h3></div>
                  </div>
                  <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Account Options</h4>
                      <ul className="space-y-2">
                          <li><button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 font-medium transition-colors disabled:opacity-50" onClick={() => { setActiveTab('orders'); setIsProfileOpen(false); }} disabled={isAuthLoading}>Order History</button></li>
                          <li><button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 font-medium transition-colors disabled:opacity-50" onClick={() => alert('Feature coming soon!')} disabled={isAuthLoading}>Saved Addresses</button></li>
                          <li><button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 font-medium transition-colors disabled:opacity-50" onClick={() => alert('Feature coming soon!')} disabled={isAuthLoading}>Payment Methods</button></li>
                          <li><button onClick={handleSignOut} disabled={isAuthLoading} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-75 font-semibold flex items-center transition-colors">{isAuthLoading ? <><Loader2 className="animate-spin mr-2" size={18}/> Signing Out...</> : 'Sign Out'}</button></li>
                      </ul>
                  </div>
            </div>
          </div>
      )}

      {isCheckoutVisible && (
          <div className="fixed inset-0 z-50 flex justify-center items-center p-4 pointer-events-none">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 sm:p-8 relative pointer-events-auto">
                <button onClick={() => {if(!isPlacingOrder && !isCartSyncing) setIsCheckoutVisible(false)}} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50 p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close Checkout" disabled={isPlacingOrder || isCartSyncing}><X size={24} /></button>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">Checkout Summary</h2>
                <div className="mb-5 max-h-64 overflow-y-auto space-y-3 pr-2 border border-gray-200 rounded-lg p-4 bg-slate-50 shadow-inner">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2 sticky top-0 bg-slate-50 pb-1 z-10">Order Items ({totalCartItems})</h3>
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between items-center text-sm border-b border-gray-200 pb-2 last:border-b-0">
                            <span className="text-gray-700 flex-1 mr-2 truncate" title={item.name}>{item.quantity} x {item.name}</span>
                            <span className="font-medium whitespace-nowrap text-gray-800">${(item.discountedPrice * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
                <div className="border-t border-gray-200 pt-5 space-y-2 mb-6">
                    <div className="flex justify-between text-base text-gray-600"><span >Subtotal</span><span className="font-medium text-gray-800">${totalCartAmount.toFixed(2)}</span></div>
                    <div className="flex justify-between text-base text-gray-600"><span >Delivery Fee</span><span className="font-medium text-gray-800">$4.99</span></div>
                    <div className="flex justify-between font-bold text-xl mt-2 pt-3 border-t border-gray-300"><span className="text-gray-800">Total</span><span className="text-indigo-700">${(totalCartAmount + 4.99).toFixed(2)}</span></div>
                </div>
                <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-200 text-center text-gray-500 text-sm shadow-sm">Address & Payment Sections (To be implemented)</div>
                  {orderPlacementError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-5 text-sm shadow-sm" role="alert">{orderPlacementError}</div>}
                <button onClick={handlePlaceOrder} disabled={isPlacingOrder || cart.length === 0 || isCartSyncing || !user} className="w-full bg-green-600 text-white py-3.5 px-4 rounded-xl hover:bg-green-700 flex justify-center items-center font-bold disabled:opacity-60 transition-all text-base shadow-lg hover:shadow-xl"> {isPlacingOrder ? <Loader2 className="animate-spin" size={20} /> : 'Place Order'} </button>
            </div>
          </div>
      )}
    </div>
  );
}