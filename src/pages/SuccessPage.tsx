import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Home } from 'lucide-react';

export function SuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border-4 border-black rounded-none shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] p-8 text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-white border-4 border-black rounded-none mb-6">
          <img
            src="https://www.axiestudio.se/Axiestudiologo.jpg"
            alt="Axie Studio"
            className="w-20 h-20 object-contain"
          />
        </div>

        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 text-white rounded-none mb-6">
          <CheckCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-black mb-2 uppercase tracking-wide">
          AXIE STUDIO
        </h1>

        <h2 className="text-3xl font-bold text-black mb-6 uppercase tracking-wide">
          PAYMENT SUCCESS!
        </h2>

        <p className="text-gray-600 mb-8 text-lg">
          Thank you for your purchase. Your Axie Studio subscription has been activated and you now have access to all premium AI workflow features.
        </p>

        {sessionId && (
          <div className="bg-gray-100 border-2 border-black rounded-none p-4 mb-8">
            <p className="text-sm font-bold text-black mb-2 uppercase tracking-wide">Session ID</p>
            <p className="text-xs font-mono text-gray-700 break-all">{sessionId}</p>
          </div>
        )}

        <div className="space-y-6">
          <Link
            to="/dashboard"
            className="w-full bg-black text-white py-4 px-6 rounded-none font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-3 uppercase tracking-wide border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[-2px] hover:translate-y-[-2px]"
          >
            <Home className="w-5 h-5" />
            GO TO DASHBOARD
          </Link>
          
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">
            REDIRECTING IN {countdown} SECONDS...
          </p>
        </div>

        <div className="mt-12 pt-8 border-t-2 border-black">
          <h3 className="font-bold text-black mb-6 uppercase tracking-wide">WHAT'S NEXT?</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-center gap-3">
              <ArrowRight className="w-4 h-4 text-black" />
              <span className="font-medium">Access all premium features</span>
            </div>
            <div className="flex items-center gap-3">
              <ArrowRight className="w-4 h-4 text-black" />
              <span className="font-medium">Manage your subscription anytime</span>
            </div>
            <div className="flex items-center gap-3">
              <ArrowRight className="w-4 h-4 text-black" />
              <span className="font-medium">Get priority customer support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}