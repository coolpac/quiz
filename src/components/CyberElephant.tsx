import React from 'react';

export const CyberElephant: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-64 h-64 flex items-center justify-center ${className}`}>
      <style>
        {`
          @keyframes walk-front-right {
            0%, 100% { transform: rotate(-25deg); }
            50% { transform: rotate(25deg); }
          }
          @keyframes walk-front-left {
            0%, 100% { transform: rotate(25deg); }
            50% { transform: rotate(-25deg); }
          }
          @keyframes walk-back-right {
            0%, 100% { transform: rotate(25deg); }
            50% { transform: rotate(-25deg); }
          }
          @keyframes walk-back-left {
            0%, 100% { transform: rotate(-25deg); }
            50% { transform: rotate(25deg); }
          }
          @keyframes body-bounce {
            0%, 100%, 50% { transform: translateY(0px); }
            25%, 75% { transform: translateY(-4px); }
          }
          @keyframes trunk-swing {
            0%, 100% { transform: rotate(-5deg); }
            50% { transform: rotate(10deg); }
          }
          
          .leg-fr { animation: walk-front-right 1.5s ease-in-out infinite; transform-origin: 65px 20px; }
          .leg-fl { animation: walk-front-left 1.5s ease-in-out infinite; transform-origin: 65px 20px; }
          .leg-br { animation: walk-back-right 1.5s ease-in-out infinite; transform-origin: 20px 20px; }
          .leg-bl { animation: walk-back-left 1.5s ease-in-out infinite; transform-origin: 20px 20px; }
          .elephant-body { animation: body-bounce 1.5s ease-in-out infinite; }
          .trunk { animation: trunk-swing 1.5s ease-in-out infinite; transform-origin: 90px 30px; }
        `}
      </style>

      <svg viewBox="0 0 120 100" className="w-full h-full elephant-body overflow-visible">
        {/* BACK LEGS (Darker for depth) */}
        <g className="leg-bl">
          {/* Back Left Leg */}
          <polygon points="20,20 10,60 25,60 30,20" fill="#4C1D95" />
          <polygon points="25,60 20,75 30,75 30,60" fill="#3B0764" />
        </g>
        <g className="leg-fl">
          {/* Front Left Leg */}
          <polygon points="65,20 55,60 70,60 75,20" fill="#4C1D95" />
          <polygon points="70,60 65,75 75,75 75,60" fill="#3B0764" />
        </g>

        {/* BODY (Mid purples) */}
        <g>
          {/* Tail */}
          <polygon points="5,25 0,45 5,48 8,25" fill="#5B21B6" />
          {/* Main Torso Facets */}
          <polygon points="10,20 40,5 75,15 80,45 40,55 15,45" fill="#7C3AED" />
          <polygon points="40,5 75,15 65,35 40,40" fill="#8B5CF6" />
          <polygon points="10,20 40,5 40,40 20,35" fill="#6D28D9" />
          <polygon points="10,20 20,35 15,45" fill="#5B21B6" />
          <polygon points="40,40 65,35 80,45 40,55" fill="#5B21B6" />
          <polygon points="20,35 40,40 15,45" fill="#4C1D95" />
        </g>

        {/* HEAD & EARS */}
        <g>
          {/* Ear Back */}
          <polygon points="65,15 55,35 70,45 80,25" fill="#4C1D95" />
          {/* Head Main */}
          <polygon points="75,15 95,10 105,25 90,45 75,35" fill="#8B5CF6" />
          <polygon points="75,15 95,10 85,25" fill="#A78BFA" />
          <polygon points="95,10 105,25 85,25" fill="#C4B5FD" />
          <polygon points="85,25 105,25 90,45" fill="#7C3AED" />
          <polygon points="75,15 85,25 75,35" fill="#6D28D9" />
          {/* Ear Front (Lavender highlights) */}
          <polygon points="70,15 60,35 75,40 85,20" fill="#A78BFA" opacity="0.9" />
          <polygon points="70,15 75,40 85,20" fill="#C4B5FD" opacity="0.9" />
          {/* Eye (Glowing) */}
          <circle cx="88" cy="20" r="2" fill="#EDE9FE" />
          <polygon points="86,18 90,18 88,22" fill="#FFFFFF" />
        </g>

        {/* TRUNK (Animated separately) */}
        <g className="trunk">
          <polygon points="90,45 105,25 110,40 95,55" fill="#7C3AED" />
          <polygon points="95,55 110,40 115,55 105,65" fill="#6D28D9" />
          <polygon points="105,65 115,55 118,65 112,70" fill="#5B21B6" />
          <polygon points="112,70 118,65 120,60 116,68" fill="#4C1D95" />
        </g>

        {/* FRONT LEGS (Brighter, closer to camera) */}
        <g className="leg-br">
          {/* Back Right Leg */}
          <polygon points="25,20 15,60 30,60 35,20" fill="#6D28D9" />
          <polygon points="30,60 25,75 35,75 35,60" fill="#5B21B6" />
          <polygon points="25,20 30,60 35,20" fill="#7C3AED" />
        </g>
        <g className="leg-fr">
          {/* Front Right Leg */}
          <polygon points="70,20 60,60 75,60 80,20" fill="#6D28D9" />
          <polygon points="75,60 70,75 80,75 80,60" fill="#5B21B6" />
          <polygon points="70,20 75,60 80,20" fill="#7C3AED" />
        </g>
      </svg>
    </div>
  );
};
