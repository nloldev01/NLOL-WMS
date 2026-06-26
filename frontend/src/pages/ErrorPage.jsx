import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { consumeRedirectError } from '../utils/api';

const ErrorPage = ({ type = '404' }) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (type === '500') setDetail(consumeRedirectError());
  }, [type]);

  const errorDetails = {
    '403': {
      title: 'Access Denied',
      message: "You don't have permission to view this page. Contact your administrator if you believe this is an error.",
      buttonText: 'Back to Home',
      icon: (
        <svg className="w-24 h-24 text-red-500 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    '404': {
      title: 'Page Not Found',
      message: "The page you're looking for doesn't exist or has been moved.",
      buttonText: 'Back to Home',
      icon: (
        <svg className="w-24 h-24 text-orange-500 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    '500': {
      title: 'Server Error',
      message: "Something went wrong on our end. Please try again later or contact support if the issue persists.",
      buttonText: 'Refresh Page',
      icon: (
        <svg className="w-24 h-24 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    }
  };

  const { title, message, buttonText, icon } = errorDetails[type] || errorDetails['404'];

  const handleAction = () => {
    if (type === '500') {
      window.location.reload();
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-md bg-white rounded-2xl shadow-xl p-10 border border-gray-100 transform transition-all hover:scale-[1.01]">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">{type}</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">{title}</h2>
        <p className="text-gray-500 mb-8 leading-relaxed">
          {message}
        </p>
        {detail && (
          <div className="mb-6 p-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg text-left break-words">
            <span className="font-semibold">Details:</span> {detail}
          </div>
        )}
        <button
          onClick={handleAction}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-700 hover:shadow-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all active:scale-95"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default ErrorPage;
