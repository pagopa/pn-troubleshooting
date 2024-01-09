package it.pagopa.pn.scripts.commands.utils;


import org.jetbrains.annotations.NotNull;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DateHoursStream {

    public static Stream<DateHour> stream(DateHour from, DateHour to, TimeUnitStep step ) {
        if( from.hour < 0 && to.hour >= 0 || from.hour >= 0 && to.hour < 0 ) {
            throw new IllegalArgumentException("Both date must be day trucated or not!");
        }

        LinkedList<DateHour> result = new LinkedList<>();

        DateHour cursor = from;
        while ( !cursor.equals( to ) ) {
            result.add( cursor );
            cursor = cursor.nextStep( step );
        }

        return result.stream();
    }

    public enum TimeUnitStep {
        DAY, HOUR
    }

    public static class DateHour implements Comparable<DateHour> {

        public static DateHour valueOf( String date, String separator) {
            return valueOf( date, separator, false);
        }
        public static DateHour valueOf( String date, String separator, boolean ensureHours) {
            List<Integer> dateParts = Arrays.stream( date.split( separator, 4) )
                    .map( Integer::parseUnsignedInt )
                    .collect(Collectors.toList());
            int datePartsSize = dateParts.size();

            if( ensureHours && datePartsSize == 3 ) {
                dateParts.add( 0 );
                datePartsSize += 1;
            }

            DateHour result;
            switch (datePartsSize) {
                case 4 : result = valueOf( dateParts.get(0), dateParts.get(1), dateParts.get(2), dateParts.get(3)); break;
                case 3 : result = valueOf( dateParts.get(0), dateParts.get(1), dateParts.get(2) ); break;
                default: throw new IllegalArgumentException("Not parsable date " + date);
            }

            return result;
        }

        public static DateHour valueOf(int year, int month, int day ) {
            return valueOf(year, month, day, -1);
        }
        public static DateHour valueOf(int year, int month, int day, int hour) {
            return new DateHour(year, month -1, day -1, hour);
        }

        private int year;
        public int getYear() {
            return year;
        }

        private int month;
        public int getMonth() {
            return month + 1;
        }

        private int day;
        public int getDay() {
            return day + 1;
        }

        private int hour;
        public int getHour() {
            return hour;
        }

        private DateHour(int year, int month, int day, int hour) {
            this.year = year;
            this.month = month;
            this.day = day;
            this.hour = hour;
        }

        public String toString( String separator ) {
            String result = String.format("%d%s%02d%s%02d", year, separator, month + 1, separator, day + 1);
            if( hour > -1 ) {
                result = result + String.format("%s%02d", separator, hour);
            }
            return result;
        }

        public DateHour nextStep( TimeUnitStep step ) {
            DateHour result;
            switch ( step ) {
                case DAY -> { result = new DateHour( this.year, this.month, this.day + 1, this.hour ); }
                case HOUR -> { result = new DateHour( this.year, this.month, this.day, this.hour + 1 ); }
                default -> throw new IllegalStateException("BUG!!!!!!");
            }

            if ( result.hour >= 24 ) {
                result.day += result.hour / 24;
                result.hour = result.hour % 24;
            }

            while ( result.day >= MAX_DAYS[result.month] ) {
                result.day -= MAX_DAYS[result.month];
                result.month += 1;

                if( result.month >= 12 ) {
                    result.month = 0;
                    result.year += 1;
                }
            }

            return result;
        }

        private static final int[] MAX_DAYS = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            DateHour dateHour = (DateHour) o;
            return year == dateHour.year && month == dateHour.month && day == dateHour.day && hour == dateHour.hour;
        }

        @Override
        public int hashCode() {
            return Objects.hash(year, month, day, hour);
        }

        @Override
        public int compareTo(@NotNull DateHoursStream.DateHour o) {
            return this.toString("").compareTo( o.toString("") );
        }
    }
}
