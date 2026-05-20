import { useState } from 'react';
import { X, Crown, Check, Zap } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import '../styles/modern-pages.css';

interface PremiumModalProps {
  user: any;
  accessToken: string;
  onClose: () => void;
}

export function PremiumModal({ user, accessToken, onClose }: PremiumModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${apiFunctionsBase}/upgrade-premium`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ planType: selectedPlan }),
        }
      );

      if (response.ok) {
        alert('Premium üyeliğe geçildi! Lütfen sayfayı yenileyin.');
        onClose();
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Yükseltme başarısız');
      }
    } catch (error) {
      console.error('Yükseltme hatası:', error);
      alert('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    {
      name: 'Monthly',
      price: '$9.99',
      period: 'month',
      value: 'monthly' as const,
    },
    {
      name: 'Yearly',
      price: '$99.99',
      period: 'year',
      value: 'yearly' as const,
      savings: 'Save $20',
    },
  ];

  const features = [
    'Unlimited downloads',
    'High-speed downloads',
    'Access to premium files',
    'No daily limits',
    'Priority support',
    'Early access to new files',
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="ilsa-surface max-w-2xl w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500 rounded-full mb-4">
            <Crown className="w-8 h-8 text-gray-900" />
          </div>
          <h2 className="ilsa-title mb-2">Upgrade to Premium</h2>
          <p className="ilsa-muted">
            Unlock unlimited downloads and premium features
          </p>
        </div>

        {/* Plan Selection */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {plans.map((plan) => (
            <button
              key={plan.value}
              onClick={() => setSelectedPlan(plan.value)}
              className={`p-6 rounded-lg border-2 transition-all ${
                selectedPlan === plan.value
                  ? 'border-yellow-500 bg-yellow-500 bg-opacity-10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <div className="text-white mb-2">{plan.name}</div>
              <div className="text-2xl text-white mb-1">{plan.price}</div>
              <div className="text-sm text-gray-400">per {plan.period}</div>
              {plan.savings && (
                <div className="mt-2 text-sm text-yellow-400">{plan.savings}</div>
              )}
            </button>
          ))}
        </div>

        {/* Features */}
        <div className="bg-gray-700 rounded-lg p-6 mb-6">
          <h3 className="text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Premium Features
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full bg-yellow-500 text-gray-900 py-3 rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            <>
              <Crown className="w-5 h-5" />
              Upgrade Now
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-500 mt-4">
          Demo mode: No actual payment required
        </p>
      </div>
    </div>
  );
}
