import { useState, useEffect } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Package, CheckCircle, ArrowLeft, Search, Filter } from 'lucide-react'

// Product types
interface Product {
  id: number
  name: string
  price: number
  description: string
  image: string
  category: string
  rating: number
  inStock: boolean
}

interface CartItem extends Product {
  quantity: number
}

interface ShippingInfo {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
}

interface PaymentInfo {
  cardNumber: string
  cardName: string
  expiryDate: string
  cvv: string
}

// Sample products data
const products: Product[] = [
  {
    id: 1,
    name: "Wireless Bluetooth Headphones",
    price: 79.99,
    description: "Premium noise-canceling headphones with 30-hour battery life and crystal-clear sound quality.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop",
    category: "Electronics",
    rating: 4.5,
    inStock: true
  },
  {
    id: 2,
    name: "Smart Watch Pro",
    price: 249.99,
    description: "Advanced fitness tracking, heart rate monitoring, and smartphone notifications on your wrist.",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
    category: "Electronics",
    rating: 4.8,
    inStock: true
  },
  {
    id: 3,
    name: "Organic Cotton T-Shirt",
    price: 34.99,
    description: "Comfortable, sustainable, and stylish. Made from 100% organic cotton.",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=300&fit=crop",
    category: "Clothing",
    rating: 4.3,
    inStock: true
  },
  {
    id: 4,
    name: "Running Shoes Elite",
    price: 129.99,
    description: "Lightweight performance running shoes with advanced cushioning technology.",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
    category: "Footwear",
    rating: 4.7,
    inStock: true
  },
  {
    id: 5,
    name: "Leather Messenger Bag",
    price: 89.99,
    description: "Handcrafted genuine leather bag perfect for work or travel.",
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=300&fit=crop",
    category: "Accessories",
    rating: 4.6,
    inStock: true
  },
  {
    id: 6,
    name: "Stainless Steel Water Bottle",
    price: 24.99,
    description: "Double-walled insulation keeps drinks cold for 24 hours or hot for 12 hours.",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=300&fit=crop",
    category: "Home",
    rating: 4.4,
    inStock: true
  },
  {
    id: 7,
    name: "Wireless Charging Pad",
    price: 39.99,
    description: "Fast wireless charging for all Qi-enabled devices with LED indicator.",
    image: "https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?w=400&h=300&fit=crop",
    category: "Electronics",
    rating: 4.2,
    inStock: true
  },
  {
    id: 8,
    name: "Yoga Mat Premium",
    price: 49.99,
    description: "Extra thick, non-slip yoga mat with carrying strap. Perfect for all skill levels.",
    image: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400&h=300&fit=crop",
    category: "Fitness",
    rating: 4.5,
    inStock: true
  },
  {
    id: 9,
    name: "Ceramic Coffee Mug Set",
    price: 29.99,
    description: "Set of 4 handcrafted ceramic mugs in assorted colors. Microwave and dishwasher safe.",
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&h=300&fit=crop",
    category: "Home",
    rating: 4.3,
    inStock: true
  },
  {
    id: 10,
    name: "Sunglasses Classic",
    price: 59.99,
    description: "UV400 protection polarized lenses with lightweight titanium frame.",
    image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=300&fit=crop",
    category: "Accessories",
    rating: 4.4,
    inStock: true
  },
  {
    id: 11,
    name: "Portable Bluetooth Speaker",
    price: 69.99,
    description: "Waterproof speaker with 360-degree sound and 20-hour playtime.",
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=300&fit=crop",
    category: "Electronics",
    rating: 4.6,
    inStock: true
  },
  {
    id: 12,
    name: "Denim Jacket Classic",
    price: 79.99,
    description: "Timeless denim jacket with modern fit. Perfect for layering.",
    image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=400&h=300&fit=crop",
    category: "Clothing",
    rating: 4.5,
    inStock: true
  }
]

const categories = ["All", "Electronics", "Clothing", "Footwear", "Accessories", "Home", "Fitness"]

type Page = 'products' | 'cart' | 'checkout' | 'payment' | 'confirmation'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('products')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  })
  
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: ''
  })

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('shopping-cart')
    if (savedCart) {
      setCart(JSON.parse(savedCart))
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('shopping-cart', JSON.stringify(cart))
  }, [cart])

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const addToCart = (product: Product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id)
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prevCart, { ...product, quantity: 1 }]
    })
  }

  const removeFromCart = (productId: number) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId))
  }

  const updateQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(productId)
      return
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    )
  }

  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0)
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0)
  const shippingCost = cartTotal > 100 ? 0 : 9.99
  const tax = cartTotal * 0.08
  const orderTotal = cartTotal + shippingCost + tax

  const handleCheckout = () => {
    if (cart.length === 0) return
    setCurrentPage('checkout')
  }

  const handlePayment = () => {
    // Validate shipping info
    const requiredFields: (keyof ShippingInfo)[] = ['firstName', 'lastName', 'email', 'address', 'city', 'state', 'zipCode']
    const isValid = requiredFields.every(field => shippingInfo[field].trim() !== '')
    if (!isValid) {
      alert('Please fill in all required shipping fields')
      return
    }
    setCurrentPage('payment')
  }

  const processPayment = () => {
    // Validate payment info
    if (!paymentInfo.cardNumber || !paymentInfo.cardName || !paymentInfo.expiryDate || !paymentInfo.cvv) {
      alert('Please fill in all payment fields')
      return
    }
    
    // Generate order number
    const newOrderNumber = 'ORD-' + Date.now().toString(36).toUpperCase()
    setOrderNumber(newOrderNumber)
    
    // Clear cart
    setCart([])
    localStorage.removeItem('shopping-cart')
    
    // Go to confirmation
    setCurrentPage('confirmation')
  }

  const startNewOrder = () => {
    setShippingInfo({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States'
    })
    setPaymentInfo({
      cardNumber: '',
      cardName: '',
      expiryDate: '',
      cvv: ''
    })
    setCurrentPage('products')
  }

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    return parts.length ? parts.join(' ') : value
  }

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  // Header Component
  const Header = () => (
    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={() => setCurrentPage('products')}
          >
            <Package className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">ShopHub</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="relative text-white hover:bg-slate-800"
              onClick={() => setCurrentPage('cart')}
            >
              <ShoppingCart className="h-6 w-6" />
              {cartItemCount > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2">
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  )

  // Products Page
  const ProductsPage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Our Products</h1>
          <p className="text-gray-600">Discover amazing products at great prices</p>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-square overflow-hidden bg-gray-100">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/400x300/png?text=Product'
                  }}
                />
              </div>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                  <div className="flex items-center gap-1 text-yellow-500">
                    <span className="text-sm">★</span>
                    <span className="text-sm text-gray-600">{product.rating}</span>
                  </div>
                </div>
                <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                <CardDescription className="line-clamp-2">{product.description}</CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-between items-center pt-0">
                <span className="text-2xl font-bold text-slate-900">${product.price.toFixed(2)}</span>
                <Button onClick={() => addToCart(product)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No products found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  )

  // Cart Page
  const CartPage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setCurrentPage('products')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Continue Shopping
        </Button>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>

        {cart.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <ShoppingCart className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg mb-4">Your cart is empty</p>
              <Button onClick={() => setCurrentPage('products')}>
                Start Shopping
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {cart.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-24 h-24 object-cover rounded-lg"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/png?text=Product'
                        }}
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{item.name}</h3>
                        <p className="text-gray-500 text-sm">{item.category}</p>
                        <p className="text-lg font-bold text-slate-900 mt-1">${item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Shipping</span>
                    <span className="font-medium">
                      {shippingCost === 0 ? (
                        <span className="text-green-600">FREE</span>
                      ) : (
                        `$${shippingCost.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax (8%)</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${orderTotal.toFixed(2)}</span>
                  </div>
                  {cartTotal < 100 && (
                    <p className="text-sm text-gray-500">
                      Add ${(100 - cartTotal).toFixed(2)} more for free shipping!
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700" 
                    size="lg"
                    onClick={handleCheckout}
                  >
                    Proceed to Checkout
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Checkout Page
  const CheckoutPage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setCurrentPage('cart')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Cart
        </Button>

        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">1</div>
            <span className="font-medium">Shipping</span>
          </div>
          <div className="flex-1 h-1 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold">2</div>
            <span className="text-gray-500">Payment</span>
          </div>
          <div className="flex-1 h-1 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold">3</div>
            <span className="text-gray-500">Confirm</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Information</CardTitle>
                <CardDescription>Enter your shipping details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={shippingInfo.firstName}
                      onChange={(e) => setShippingInfo({...shippingInfo, firstName: e.target.value})}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={shippingInfo.lastName}
                      onChange={(e) => setShippingInfo({...shippingInfo, lastName: e.target.value})}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={shippingInfo.email}
                      onChange={(e) => setShippingInfo({...shippingInfo, email: e.target.value})}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={shippingInfo.phone}
                      onChange={(e) => setShippingInfo({...shippingInfo, phone: e.target.value})}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Street Address *</Label>
                  <Input
                    id="address"
                    value={shippingInfo.address}
                    onChange={(e) => setShippingInfo({...shippingInfo, address: e.target.value})}
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={shippingInfo.city}
                      onChange={(e) => setShippingInfo({...shippingInfo, city: e.target.value})}
                      placeholder="New York"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={shippingInfo.state}
                      onChange={(e) => setShippingInfo({...shippingInfo, state: e.target.value})}
                      placeholder="NY"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={shippingInfo.zipCode}
                      onChange={(e) => setShippingInfo({...shippingInfo, zipCode: e.target.value})}
                      placeholder="10001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select 
                      value={shippingInfo.country} 
                      onValueChange={(value) => setShippingInfo({...shippingInfo, country: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="United States">United States</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                        <SelectItem value="Australia">Australia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700" 
                  size="lg"
                  onClick={handlePayment}
                >
                  Continue to Payment
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.map(item => (
                  <div key={item.id} className="flex gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/50x50/png?text=P'
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                      <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium">
                    {shippingCost === 0 ? <span className="text-green-600">FREE</span> : `$${shippingCost.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>${orderTotal.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )

  // Payment Page
  const PaymentPage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setCurrentPage('checkout')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Shipping
        </Button>

        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center">
              <CheckCircle className="h-5 w-5" />
            </div>
            <span className="font-medium text-green-600">Shipping</span>
          </div>
          <div className="flex-1 h-1 bg-green-600"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">2</div>
            <span className="font-medium">Payment</span>
          </div>
          <div className="flex-1 h-1 bg-gray-200"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold">3</div>
            <span className="text-gray-500">Confirm</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Details
                </CardTitle>
                <CardDescription>Enter your card information securely</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input
                    id="cardNumber"
                    value={paymentInfo.cardNumber}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardNumber: formatCardNumber(e.target.value)})}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardName">Name on Card</Label>
                  <Input
                    id="cardName"
                    value={paymentInfo.cardName}
                    onChange={(e) => setPaymentInfo({...paymentInfo, cardName: e.target.value})}
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiryDate">Expiry Date</Label>
                    <Input
                      id="expiryDate"
                      value={paymentInfo.expiryDate}
                      onChange={(e) => setPaymentInfo({...paymentInfo, expiryDate: formatExpiryDate(e.target.value)})}
                      placeholder="MM/YY"
                      maxLength={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      type="password"
                      value={paymentInfo.cvv}
                      onChange={(e) => setPaymentInfo({...paymentInfo, cvv: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                      placeholder="123"
                      maxLength={4}
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mt-6">
                  <h4 className="font-medium mb-2">Shipping To:</h4>
                  <p className="text-sm text-gray-600">
                    {shippingInfo.firstName} {shippingInfo.lastName}<br />
                    {shippingInfo.address}<br />
                    {shippingInfo.city}, {shippingInfo.state} {shippingInfo.zipCode}<br />
                    {shippingInfo.country}
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700" 
                  size="lg"
                  onClick={processPayment}
                >
                  Pay ${orderTotal.toFixed(2)}
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.map(item => (
                  <div key={item.id} className="flex gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/50x50/png?text=P'
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                      <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium">
                    {shippingCost === 0 ? <span className="text-green-600">FREE</span> : `$${shippingCost.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>${orderTotal.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )

  // Confirmation Page
  const ConfirmationPage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card className="text-center">
          <CardContent className="pt-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Confirmed!</h1>
            <p className="text-gray-600 mb-6">Thank you for your purchase</p>
            
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <p className="text-sm text-gray-500 mb-1">Order Number</p>
              <p className="text-2xl font-bold text-slate-900">{orderNumber}</p>
            </div>

            <div className="text-left bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-blue-900 mb-2">What's Next?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• You will receive an email confirmation shortly</li>
                <li>• Your order will be processed within 1-2 business days</li>
                <li>• Tracking information will be sent once shipped</li>
              </ul>
            </div>

            <div className="text-left mb-6">
              <h3 className="font-medium mb-2">Shipping Address</h3>
              <p className="text-sm text-gray-600">
                {shippingInfo.firstName} {shippingInfo.lastName}<br />
                {shippingInfo.address}<br />
                {shippingInfo.city}, {shippingInfo.state} {shippingInfo.zipCode}<br />
                {shippingInfo.country}
              </p>
            </div>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700" 
              size="lg"
              onClick={startNewOrder}
            >
              Continue Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      {currentPage === 'products' && <ProductsPage />}
      {currentPage === 'cart' && <CartPage />}
      {currentPage === 'checkout' && <CheckoutPage />}
      {currentPage === 'payment' && <PaymentPage />}
      {currentPage === 'confirmation' && <ConfirmationPage />}
    </div>
  )
}

export default App
