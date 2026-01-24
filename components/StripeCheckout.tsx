
import React, { useState } from 'react';
import { Button } from './Button';

interface StripeCheckoutProps {
  onSuccess: () => void;
  onCancel: () => void;
  price: string;
  planName: string;
}

export const StripeCheckout: React.FC<StripeCheckoutProps> = ({ onSuccess, onCancel, price, planName }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    // Simulate Stripe Payment Intent lifecycle
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 2500);
  };

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, '');
    return digits.match(/.{1,4}/g)?.join(' ').substr(0, 19) || digits;
  };

  return (
    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 space-y-8 animate-in zoom-in-95 border border-slate-200 dark:border-slate-800 shadow-2xl relative">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800">
          Secure Checkout
        </div>
        <h3 className="text-2xl font-black">Upgrade to {planName}</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">One-time payment of <span className="text-slate-900 dark:text-white font-bold">{price}</span></p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-1 block">Card Number</label>
            <div className="relative">
              <input 
                required
                type="text" 
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono" 
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-1 block">Expiry</label>
              <input 
                required
                type="text" 
                placeholder="MM / YY"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono" 
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 mb-1 block">CVC</label>
              <input 
                required
                type="text" 
                placeholder="•••"
                maxLength={3}
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono" 
              />
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <Button 
            type="submit"
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 dark:shadow-none"
            isLoading={isProcessing}
          >
            {isProcessing ? 'Verifying...' : `Pay ${price}`}
          </Button>
          <button 
            type="button"
            onClick={onCancel}
            className="w-full text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Cancel Payment
          </button>
        </div>
      </form>

      <div className="flex items-center justify-center gap-4 pt-2 grayscale opacity-40">
        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" className="h-4" alt="Visa" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className="h-6" alt="Mastercard" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" className="h-6" alt="Stripe" />
      </div>
    </div>
  );
};
