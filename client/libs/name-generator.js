export  function generateName() {
    const names = [
        'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 
        'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 
        'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 
        'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu'
    ];
    
    const alphabets = [ 'A', 'B', 'C', 'G', 'J', 'K', 'P', 'V', 'Z' ];
    
    const rand = (max = 10) => {
        return Math.floor(Math.random() * max);
    };
    
    return `${names[rand(names.length)]}-${alphabets[rand(alphabets.length)]}${rand(9)+1}`;
    
}