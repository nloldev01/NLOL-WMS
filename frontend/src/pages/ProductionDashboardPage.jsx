import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import { BeakerIcon, ArrowPathIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const MOCK_ASSETS = [
  {
    id: 1,
    name: 'Storage Tank A',
    type: 'Storage Tank',
    capacity: 10000,
    unit: 'Liters',
    status: 'active',
    contents: [{ material: 'Base Oil SN150', quantity: 7500 }],
    lastUpdated: '10 mins ago',
    temperature: '22°C'
  },
  {
    id: 2,
    name: 'Storage Tank B',
    type: 'Storage Tank',
    capacity: 15000,
    unit: 'Liters',
    status: 'active',
    contents: [{ material: 'Base Oil SN500', quantity: 12000 }],
    lastUpdated: '5 mins ago',
    temperature: '24°C'
  },
  {
    id: 3,
    name: 'Storage Tank C',
    type: 'Storage Tank',
    capacity: 20000,
    unit: 'Liters',
    status: 'inactive',
    contents: [],
    lastUpdated: '1 hour ago',
    temperature: 'ambient'
  },
  {
    id: 4,
    name: 'Vertical Tank 1',
    type: 'Vertical Tank',
    capacity: 5000,
    unit: 'Liters',
    status: 'maintenance',
    contents: [{ material: 'Additive AddiZ', quantity: 500 }],
    lastUpdated: '2 days ago',
    temperature: '20°C'
  },
  {
    id: 5,
    name: 'Vertical Tank 2',
    type: 'Vertical Tank',
    capacity: 5000,
    unit: 'Liters',
    status: 'active',
    contents: [{ material: 'Additive Y', quantity: 4100 }],
    lastUpdated: 'Just now',
    temperature: '21°C'
  },
  {
    id: 6,
    name: 'Vertical Tank 3',
    type: 'Vertical Tank',
    capacity: 8000,
    unit: 'Liters',
    status: 'active',
    contents: [{ material: 'Additive X', quantity: 6000 }],
    lastUpdated: '15 mins ago',
    temperature: '22°C'
  },
  {
    id: 7,
    name: 'Vertical Tank 4',
    type: 'Vertical Tank',
    capacity: 8000,
    unit: 'Liters',
    status: 'active',
    contents: [{ material: 'Base Oil Light', quantity: 1200 }],
    lastUpdated: '20 mins ago',
    temperature: '25°C'
  },
  {
    id: 8,
    name: 'Mixing Kettle 1',
    type: 'Kettle',
    capacity: 3000,
    unit: 'Liters',
    status: 'active',
    contents: [
      { material: 'Base Oil SN150', quantity: 1000 },
      { material: 'Additive Mix', quantity: 200 }
    ],
    lastUpdated: '2 mins ago',
    temperature: '85°C'
  },
  {
    id: 9,
    name: 'Mixing Kettle 2',
    type: 'Kettle',
    capacity: 5000,
    unit: 'Liters',
    status: 'active',
    contents: [],
    lastUpdated: '3 hours ago',
    temperature: 'ambient'
  }
];

const ProductionDashboardPage = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAssets(MOCK_ASSETS);
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const getFillPercentage = (asset) => {
    const totalStored = asset.contents.reduce((sum, item) => sum + item.quantity, 0);
    return Math.min(Math.round((totalStored / asset.capacity) * 100), 100);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'maintenance': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLiquidColor = (percentage, type) => {
    if (type === 'Kettle') return 'bg-gradient-to-t from-orange-500 to-orange-400';
    if (percentage > 85) return 'bg-gradient-to-t from-red-500 to-red-400';
    if (percentage < 15 && percentage > 0) return 'bg-gradient-to-t from-yellow-500 to-yellow-400';
    return 'bg-gradient-to-t from-blue-500 to-blue-400';
  };

  const storageTanks = assets.filter(a => a.type === 'Storage Tank');
  const verticalTanks = assets.filter(a => a.type === 'Vertical Tank');
  const kettles = assets.filter(a => a.type === 'Kettle');

  const AssetCard = ({ asset, isHorizontal = false }) => {
    const fillPercentage = getFillPercentage(asset);
    const totalStored = asset.contents.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div 
        onClick={() => setSelectedAsset(asset)}
        className={`bg-white rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-slate-100 overflow-hidden flex flex-col cursor-pointer ${isHorizontal ? 'min-w-[320px] max-w-[320px] snap-center' : ''}`}
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-800">{asset.name}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">{asset.type}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getStatusColor(asset.status)}`}>
            {asset.status}
          </span>
        </div>

        <div className="p-5 flex-1 flex flex-col">
          <div className="flex justify-between text-xs mb-2">
            <span className="font-medium text-slate-500">Utilization</span>
            <span className="font-bold text-slate-800">{totalStored.toLocaleString()} / {asset.capacity.toLocaleString()}</span>
          </div>
          
          <div className="relative h-32 bg-slate-50 rounded-xl overflow-hidden border border-slate-200/60 shadow-inner group mb-4">
            <div 
              className={`absolute bottom-0 w-full transition-all duration-1000 ease-in-out opacity-90 group-hover:opacity-100 ${getLiquidColor(fillPercentage, asset.type)}`}
              style={{ height: `${fillPercentage}%` }}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-white/30"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xl font-black drop-shadow-sm ${fillPercentage > 40 ? 'text-white' : 'text-slate-600'}`}>
                {fillPercentage}%
              </span>
            </div>
          </div>

          <div className="flex-1">
            {asset.contents.length > 0 ? (
              <div className="space-y-2">
                {asset.contents.slice(0, 2).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-100/50">
                    <span className="text-xs font-medium text-slate-600 truncate pr-2">{item.material}</span>
                    <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                      {(item.quantity / 1000).toFixed(1)}k
                    </span>
                  </div>
                ))}
                {asset.contents.length > 2 && (
                  <p className="text-[10px] text-center text-slate-400 font-medium">+ {asset.contents.length - 2} more</p>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium italic p-2 bg-slate-50 rounded-lg border border-slate-100/50">
                Empty
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const AssetModal = () => {
    if (!selectedAsset) return null;
    const fillPercentage = getFillPercentage(selectedAsset);
    const totalStored = selectedAsset.contents.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{selectedAsset.name}</h2>
              <div className="flex items-center space-x-3 mt-2">
                <span className="text-sm font-medium text-slate-500">{selectedAsset.type}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getStatusColor(selectedAsset.status)}`}>
                  {selectedAsset.status}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setSelectedAsset(null)}
              className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-8 overflow-y-auto">
            {/* Visual Header */}
            <div className="flex flex-col md:flex-row gap-8 mb-8">
              {/* Big Tank Visualization */}
              <div className="w-full md:w-1/3 relative h-64 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                <div 
                  className={`absolute bottom-0 w-full transition-all duration-1000 ease-in-out ${getLiquidColor(fillPercentage, selectedAsset.type)}`}
                  style={{ height: `${fillPercentage}%` }}
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-white/30"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-3xl font-black drop-shadow-md ${fillPercentage > 40 ? 'text-white' : 'text-slate-700'}`}>
                    {fillPercentage}%
                  </span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="w-full md:w-2/3 grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Stock</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{totalStored.toLocaleString()} <span className="text-sm font-medium text-slate-500">{selectedAsset.unit}</span></p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Capacity</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{selectedAsset.capacity.toLocaleString()} <span className="text-sm font-medium text-slate-500">{selectedAsset.unit}</span></p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Temperature</p>
                  <p className="text-lg font-bold text-slate-700 mt-1">{selectedAsset.temperature}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Last Updated</p>
                  <p className="text-lg font-bold text-slate-700 mt-1">{selectedAsset.lastUpdated}</p>
                </div>
              </div>
            </div>

            {/* Detailed Contents */}
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <InformationCircleIcon className="w-5 h-5 mr-2 text-slate-400" />
                Material Breakdown
              </h3>
              {selectedAsset.contents.length > 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Material</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">% of Tank</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {selectedAsset.contents.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                            {item.material}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right font-medium">
                            {item.quantity.toLocaleString()} {selectedAsset.unit}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                            {((item.quantity / selectedAsset.capacity) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                  <p className="text-slate-500 font-medium">This asset is currently empty.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden">
        <Topbar />
        
        <main className="flex-1 overflow-y-auto p-8 pb-20">
          {/* Header */}
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-6 -mr-6 opacity-5 pointer-events-none">
               <BeakerIcon className="w-32 h-32 text-orange-600" />
            </div>
            <div className="relative z-10 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Factory Dashboard</h1>
                <p className="text-slate-500 mt-1 text-sm">Real-time monitoring of manufacturing assets and storage.</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <ArrowPathIcon className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-12">
              
              {/* Storage Tanks Section */}
              <section>
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-sm mr-3">Bulk</span>
                  Storage Tanks
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {storageTanks.map(asset => <AssetCard key={asset.id} asset={asset} />)}
                </div>
              </section>

              {/* Vertical Tanks Section (Horizontal Scroll) */}
              <section>
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-lg text-sm mr-3">Additives</span>
                  Vertical Tanks
                </h2>
                {/* Horizontal scroll container */}
                <div className="flex space-x-6 overflow-x-auto pb-6 pt-2 px-2 -mx-2 snap-x scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                  {verticalTanks.map(asset => <AssetCard key={asset.id} asset={asset} isHorizontal={true} />)}
                </div>
              </section>

              {/* Kettles Section */}
              <section>
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-lg text-sm mr-3">Active</span>
                  Mixing Kettles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {kettles.map(asset => <AssetCard key={asset.id} asset={asset} />)}
                </div>
              </section>

            </div>
          )}
        </main>
      </div>

      <AssetModal />
    </div>
  );
};

export default ProductionDashboardPage;
