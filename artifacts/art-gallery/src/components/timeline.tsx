import { motion } from "framer-motion";
import { TimelineEvent } from "@workspace/api-client-react";

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative max-w-4xl mx-auto px-4 py-8">
      <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[1px] bg-border md:-translate-x-1/2"></div>
      
      <div className="space-y-16">
        {events.map((event, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className={`relative flex flex-col md:flex-row gap-8 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
          >
            <div className="absolute left-4 md:left-1/2 w-3 h-3 bg-secondary rounded-full -translate-x-[5px] md:-translate-x-[5.5px] mt-2 md:mt-0 md:top-6"></div>
            
            <div className="ml-12 md:ml-0 md:w-1/2 flex flex-col md:px-12">
              <div className={`flex flex-col ${idx % 2 === 0 ? 'md:items-start md:text-left' : 'md:items-end md:text-right'}`}>
                <span className="font-display text-3xl text-secondary mb-2">{event.year}</span>
                <h3 className="font-display text-xl text-primary mb-4">{event.title}</h3>
                <p className="text-foreground/80 leading-relaxed">{event.description}</p>
              </div>
            </div>
            
            <div className="hidden md:block md:w-1/2"></div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
